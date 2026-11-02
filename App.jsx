import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, BookOpen, Clapperboard, Download, FileAudio, FileText, FolderOpen, Headphones, Mic, Music2, Play, Plus, Save, Settings2, Sparkles, Trash2, Upload, Volume2, WandSparkles, X } from 'lucide-react';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import lamejs from 'lamejs';
const { Mp3Encoder } = lamejs;

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

const uid = () => Math.random().toString(36).slice(2, 10);
const initialText = `NARRADOR: La lluvia golpeaba los cristales de la vieja casona. Eran casi las doce de la noche.
ELENA: ¿Escuchaste eso? Alguien está caminando en el piso de arriba.
MATEO: No puede ser. Esta casa lleva veinte años abandonada.
NARRADOR: Un golpe seco interrumpió la conversación. Después, una voz susurró desde la oscuridad.
VOZ MISTERIOSA: Nunca debieron abrir esa puerta.`;

function splitScript(text) {
  return text.split(/\n+/).map(line => line.trim()).filter(Boolean).map((line, i) => {
    const match = line.match(/^([A-ZÁÉÍÓÚÜÑ0-9 _-]{2,35}):\s*(.*)$/i);
    return { id: uid(), speaker: match ? match[1].trim().toUpperCase() : 'NARRADOR', text: match ? match[2] : line, order: i + 1, audioUrl: null, audioBlob: null, duration: 0 };
  });
}
function fmtTime(s) { if (!Number.isFinite(s)) return '00:00'; return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`; }

export default function App() {
  const [project, setProject] = useState('Mi primera radionovela');
  const [script, setScript] = useState(initialText);
  const [scenes, setScenes] = useState(() => splitScript(initialText));
  const [active, setActive] = useState(0);
  const [voices, setVoices] = useState([]);
  const [voiceMap, setVoiceMap] = useState({});
  const [assets, setAssets] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState('Proyecto local listo. Importa un guion para comenzar.');
  const [tab, setTab] = useState('guion');
  const [master, setMaster] = useState(85);
  const [musicVolume, setMusicVolume] = useState(22);
  const [isDirty, setIsDirty] = useState(false);
  const [duration, setDuration] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const fileRef = useRef(null);
  const audioInputRef = useRef(null);

  useEffect(() => {
    const load = () => {
      const list = window.speechSynthesis?.getVoices?.() || [];
      setVoices(list.filter(v => v.lang.toLowerCase().startsWith('es')));
    };
    load();
    window.speechSynthesis?.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', load);
  }, []);

  const speakers = useMemo(() => [...new Set(scenes.map(s => s.speaker))], [scenes]);
  const current = scenes[active];

  function notify(msg) { setNotice(msg); window.setTimeout(() => setNotice(''), 4500); }
  function rebuild(text) { setScript(text); setScenes(splitScript(text)); setActive(0); setIsDirty(true); }

  async function importScript(file) {
    if (!file) return;
    try {
      let text = '';
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'txt') text = await file.text();
      else if (ext === 'docx' || ext === 'doc') {
        if (ext === 'doc') throw new Error('El formato .doc antiguo no está soportado. Guarda el documento como .docx.');
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        text = result.value;
      } else if (ext === 'pdf') {
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const pages = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const content = await page.getTextContent();
          pages.push(content.items.map(item => item.str).join(' '));
        }
        text = pages.join('\n');
      } else throw new Error('Formato no compatible. Usa PDF, DOCX o TXT.');
      if (!text.trim()) throw new Error('No se encontró texto seleccionable. Si el PDF es un escaneo, primero aplica OCR.');
      setProject(file.name.replace(/\.[^.]+$/, ''));
      rebuild(text);
      setTab('guion');
      notify(`Guion importado: ${file.name}`);
    } catch (e) { notify(e.message || 'No se pudo importar el archivo.'); }
    if (fileRef.current) fileRef.current.value = '';
  }

  function updateScene(id, patch) {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    setIsDirty(true);
  }
  function previewVoice(scene) {
    if (!scene?.text) return;
    if (!window.speechSynthesis) return notify('Este navegador no ofrece síntesis de voz.');
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(scene.text);
    const selected = voiceMap[scene.speaker];
    utter.voice = voices.find(v => v.name === selected) || voices[0] || null;
    utter.lang = utter.voice?.lang || 'es-MX';
    utter.rate = 0.92;
    window.speechSynthesis.speak(utter);
  }
  function previewAll() {
    if (!window.speechSynthesis) return notify('Síntesis de voz no disponible en este navegador.');
    window.speechSynthesis.cancel();
    let i = 0;
    const speakNext = () => {
      if (i >= scenes.length) { setPlaying(false); return; }
      const s = scenes[i++];
      const u = new SpeechSynthesisUtterance(s.text);
      u.voice = voices.find(v => v.name === voiceMap[s.speaker]) || voices[0] || null;
      u.lang = u.voice?.lang || 'es-MX'; u.rate = 0.92;
      u.onend = speakNext; u.onerror = speakNext;
      window.speechSynthesis.speak(u);
      setActive(i - 1);
    };
    setPlaying(true); speakNext();
  }
  function stopPreview() { window.speechSynthesis?.cancel(); setPlaying(false); }

  async function addAudioFiles(list) {
    const added = [];
    for (const file of Array.from(list || [])) {
      if (!file.type.startsWith('audio/')) continue;
      const url = URL.createObjectURL(file);
      added.push({ id: uid(), name: file.name, url, file, type: file.name.toLowerCase().includes('mus') ? 'Música' : 'Efecto', volume: 60, duration: 0 });
    }
    setAssets(prev => [...prev, ...added]);
    notify(`${added.length} archivo(s) de audio añadido(s).`);
  }
  function deleteAsset(id) {
    setAssets(prev => { const item = prev.find(a => a.id === id); if (item) URL.revokeObjectURL(item.url); return prev.filter(a => a.id !== id); });
  }
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) return notify('La grabación requiere HTTPS y permiso de micrófono.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onloadedmetadata = () => {
          updateScene(current.id, { audioBlob: blob, audioUrl: url, duration: audio.duration });
          setDuration(audio.duration);
          notify(`Grabación guardada en la escena ${active + 1}.`);
        };
        stream.getTracks().forEach(t => t.stop());
      };
      recorderRef.current = rec; rec.start(); setRecording(true);
    } catch { notify('No se pudo acceder al micrófono. Revisa los permisos del navegador.'); }
  }
  function stopRecording() { recorderRef.current?.stop(); setRecording(false); }

  async function decodeFile(ctx, file) {
    const buf = await file.arrayBuffer();
    return await ctx.decodeAudioData(buf.slice(0));
  }
  async function buildMix() {
    const recorded = scenes.filter(s => s.audioBlob);
    if (!recorded.length && !assets.length) {
      notify('Graba al menos un diálogo o añade música/efectos antes de exportar.'); return null;
    }
    let maxEnd = 0;
    const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
    const decodedScenes = new Map();
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (!s.audioBlob) continue;
      const decoded = await decodeFile(decodeCtx, s.audioBlob);
      decodedScenes.set(s.id, decoded);
      maxEnd = Math.max(maxEnd, i * 0.15 + decoded.duration);
    }
    const decodedAssets = new Map();
    for (const a of assets) {
      try {
        const decoded = await decodeFile(decodeCtx, a.file);
        decodedAssets.set(a.id, decoded);
        maxEnd = Math.max(maxEnd, decoded.duration);
      } catch { /* formato no decodificable omitido */ }
    }
    await decodeCtx.close();
    const frames = Math.max(1, Math.ceil(Math.min(maxEnd + 0.5, 1200) * 44100));
    const finalCtx = new OfflineAudioContext(2, frames, 44100);
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i]; if (!s.audioBlob) continue;
      const decoded = decodedScenes.get(s.id);
      const source = finalCtx.createBufferSource(); source.buffer = decoded;
      const gain = finalCtx.createGain(); gain.gain.value = master / 100;
      source.connect(gain).connect(finalCtx.destination); source.start(i * 0.15);
    }
    for (const a of assets) {
      try {
        const decoded = decodedAssets.get(a.id);
        if (!decoded) continue;
        const source = finalCtx.createBufferSource(); source.buffer = decoded;
        const gain = finalCtx.createGain(); gain.gain.value = (a.volume / 100) * (a.type === 'Música' ? musicVolume / 100 : 1);
        source.connect(gain).connect(finalCtx.destination); source.start(0);
      } catch {}
    }
    return await finalCtx.startRendering();
  }
  function bufferToWav(buffer) {
    const channels = buffer.numberOfChannels, length = buffer.length, sampleRate = buffer.sampleRate;
    const bytes = 44 + length * channels * 2, out = new ArrayBuffer(bytes), view = new DataView(out);
    const write = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
    write(0,'RIFF'); view.setUint32(4, bytes - 8, true); write(8,'WAVE'); write(12,'fmt ');
    view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,channels,true);
    view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*channels*2,true);
    view.setUint16(32,channels*2,true); view.setUint16(34,16,true); write(36,'data'); view.setUint32(40,bytes-44,true);
    let offset=44;
    for(let i=0;i<length;i++) for(let ch=0;ch<channels;ch++){
      let sample=Math.max(-1,Math.min(1,buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample*0x8000 : sample*0x7fff, true); offset+=2;
    }
    return new Blob([out],{type:'audio/wav'});
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function exportWav() {
    try { notify('Preparando mezcla WAV…'); const mix=await buildMix(); if(mix) { download(bufferToWav(mix), `${project || 'radionovela'}.wav`); notify('Archivo WAV exportado.'); } }
    catch(e) { notify(`Error al exportar: ${e.message}`); }
  }
  async function exportMp3() {
    try {
      notify('Preparando MP3…'); const mix=await buildMix(); if(!mix) return;
      const encoder=new Mp3Encoder(mix.numberOfChannels, mix.sampleRate, 192), chunks=[];
      const left=mix.getChannelData(0), right=mix.numberOfChannels>1?mix.getChannelData(1):left;
      const block=1152;
      for(let i=0;i<left.length;i+=block){
        const l=new Int16Array(Math.min(block,left.length-i)), r=new Int16Array(l.length);
        for(let j=0;j<l.length;j++){ l[j]=Math.max(-32768,Math.min(32767,left[i+j]*32767)); r[j]=Math.max(-32768,Math.min(32767,right[i+j]*32767)); }
        const encoded=encoder.encodeBuffer(l,r); if(encoded.length) chunks.push(new Uint8Array(encoded));
      }
      const end=encoder.flush(); if(end.length) chunks.push(new Uint8Array(end));
      download(new Blob(chunks,{type:'audio/mpeg'}),`${project || 'radionovela'}.mp3`); notify('Archivo MP3 exportado.');
    } catch(e) { notify(`Error al exportar MP3: ${e.message}`); }
  }
  function saveProject() {
    const data={version:1,project,script,scenes:scenes.map(({audioBlob,audioUrl,...s})=>s),voiceMap,createdAt:new Date().toISOString()};
    download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`${project || 'proyecto'}.rns.json`);
    setIsDirty(false); notify('Proyecto guardado. Las grabaciones de audio deben exportarse por separado.');
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><AudioLines size={24}/></div><div><b>RadioNovela</b><span>STUDIO</span></div></div>
      <div className="side-label">ESTUDIO</div>
      <button className={`nav-item ${tab==='guion'?'selected':''}`} onClick={()=>setTab('guion')}><BookOpen size={18}/> Guion y escenas</button>
      <button className={`nav-item ${tab==='voces'?'selected':''}`} onClick={()=>setTab('voces')}><Volume2 size={18}/> Voces y personajes</button>
      <button className={`nav-item ${tab==='audio'?'selected':''}`} onClick={()=>setTab('audio')}><AudioLines size={18}/> Edición de audio</button>
      <div className="sidebar-bottom"><div className="plan-card"><Sparkles size={17}/><b>Tu estudio creativo</b><p>Convierte tus historias en experiencias sonoras.</p></div><div className="user-row"><div className="avatar">RN</div><div><b>Productor</b><span>Espacio local</span></div><Settings2 size={17}/></div></div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div className="breadcrumb">Proyectos <span>/</span> <b>{project}</b>{isDirty&&<i className="unsaved-dot"/>}</div>
        <div className="top-actions"><button className="btn ghost" onClick={saveProject}><Save size={16}/> Guardar</button><button className="btn primary" onClick={exportMp3}><Download size={16}/> Exportar capítulo</button></div>
      </header>
      <section className="workspace">
        <div className="page-heading"><div><div className="eyebrow">PRODUCCIÓN DE AUDIO</div><h1>{tab==='guion'?'Guion y escenas':tab==='voces'?'Voces y personajes':'Edición de audio'}</h1><p>Da vida a tus historias, escena por escena.</p></div><div className="project-pill"><span className="live-dot"/> Proyecto activo</div></div>

        {tab==='guion'&&<div className="grid-main">
          <section className="panel script-panel">
            <div className="panel-head"><div><h2><FileText size={18}/> Guion de la radionovela</h2><p>Importa tu documento o escribe directamente.</p></div><button className="btn outline" onClick={()=>fileRef.current?.click()}><Upload size={16}/> Importar guion</button><input ref={fileRef} hidden type="file" accept=".pdf,.docx,.txt" onChange={e=>importScript(e.target.files?.[0])}/></div>
            <div className="script-meta"><span><FileText size={14}/> {scenes.length} bloques detectados</span><span>Formato: PDF · DOCX · TXT</span></div>
            <textarea className="script-editor" value={script} onChange={e=>{setScript(e.target.value);setIsDirty(true);}} placeholder="Escribe tu guion aquí. Usa NARRADOR: o PERSONAJE: al inicio de cada diálogo."/>
            <div className="editor-footer"><span>Consejo: escribe PERSONAJE: antes de cada diálogo para asignar voces automáticamente.</span><button className="btn small primary" onClick={()=>{setScenes(splitScript(script));setActive(0);notify('Escenas actualizadas desde el guion.')}}><WandSparkles size={15}/> Detectar escenas</button></div>
          </section>
          <section className="panel scene-panel">
            <div className="panel-head"><div><h2><Clapperboard size={18}/> Escenas detectadas</h2><p>Selecciona una escena para editarla.</p></div><span className="count-badge">{scenes.length}</span></div>
            <div className="scene-list">{scenes.map((s,i)=><button key={s.id} className={`scene-row ${active===i?'active':''}`} onClick={()=>setActive(i)}><span className="scene-number">{String(i+1).padStart(2,'0')}</span><span className="scene-copy"><b>{s.speaker}</b><small>{s.text}</small></span>{s.audioBlob&&<span className="recorded-dot" title="Audio grabado"/>}</button>)}</div>
            <div className="scene-actions"><button className="btn ghost" onClick={previewAll} disabled={!scenes.length}><Play size={15}/> Escuchar guion</button><button className="btn ghost" onClick={stopPreview}>Detener</button></div>
          </section>
          <section className="panel detail-panel">
            <div className="panel-head"><div><h2><Clapperboard size={18}/> Editor de escena</h2><p>{current?`Escena ${active+1} de ${scenes.length}`:'Selecciona una escena'}</p></div></div>
            {current?<><label className="field-label">PERSONAJE / LOCUTOR</label><input className="text-input" value={current.speaker} onChange={e=>updateScene(current.id,{speaker:e.target.value.toUpperCase()})}/><label className="field-label">DIÁLOGO</label><textarea className="dialogue-input" value={current.text} onChange={e=>updateScene(current.id,{text:e.target.value})}/><div className="detail-buttons"><button className="btn outline" onClick={()=>previewVoice(current)}><Volume2 size={16}/> Previsualizar voz</button><button className="btn primary" onClick={recording?stopRecording:startRecording}><Mic size={16}/>{recording?'Detener grabación':'Grabar diálogo'}</button></div>{current.audioBlob&&<div className="audio-attached"><FileAudio size={15}/> Audio grabado · {fmtTime(current.duration)} <button onClick={()=>{URL.revokeObjectURL(current.audioUrl);updateScene(current.id,{audioBlob:null,audioUrl:null,duration:0})}}><Trash2 size={14}/></button></div>}</>:<p className="empty">No hay escenas todavía.</p>}
          </section>
        </div>}

        {tab==='voces'&&<div className="panel full-panel"><div className="panel-head"><div><h2><Volume2 size={18}/> Reparto y voces</h2><p>Asigna una voz disponible a cada personaje de tu historia.</p></div></div><div className="voice-note"><Sparkles size={18}/><div><b>Voces disponibles en tu dispositivo</b><p>La lista depende del navegador y del sistema operativo. La voz elegida se utiliza en la previsualización.</p></div></div><div className="voice-grid">{speakers.map(sp=><div className="voice-card" key={sp}><div className="voice-avatar">{sp.slice(0,2)}</div><div className="voice-info"><b>{sp}</b><span>{scenes.filter(s=>s.speaker===sp).length} intervenciones</span></div><select value={voiceMap[sp]||''} onChange={e=>setVoiceMap(p=>({...p,[sp]:e.target.value}))}><option value="">Voz automática (español)</option>{voices.map(v=><option key={v.name} value={v.name}>{v.name} · {v.lang}</option>)}</select><button className="icon-btn" title="Probar voz" onClick={()=>previewVoice(scenes.find(s=>s.speaker===sp))}><Play size={16}/></button></div>)}</div>{!voices.length&&<p className="empty">No se detectaron voces en español. Instala voces en español en tu dispositivo o prueba con otro navegador.</p>}</div>}

        {tab==='audio'&&<div className="audio-layout"><section className="panel mixer-panel"><div className="panel-head"><div><h2><AudioLines size={18}/> Mesa de mezcla</h2><p>Administra las grabaciones, música y efectos.</p></div><button className="btn outline" onClick={()=>audioInputRef.current?.click()}><Plus size={16}/> Añadir audio</button><input ref={audioInputRef} hidden multiple type="file" accept="audio/*" onChange={e=>addAudioFiles(e.target.files)}/></div><div className="track-list"><div className="track-header"><span>PISTA</span><span>TIPO</span><span>VOLUMEN</span><span>ACCIÓN</span></div>{scenes.filter(s=>s.audioBlob).map((s,i)=><div className="track-row" key={s.id}><div className="track-name"><span className="track-icon voice"><Mic size={15}/></span><div><b>{s.speaker}</b><small>Diálogo · Escena {scenes.indexOf(s)+1}</small></div></div><span className="type-chip">Voz</span><span className="track-volume"><span className="wave-mini">▂▅▃▇▅▂▆▃▅▇▂</span>{fmtTime(s.duration)}</span><button className="icon-btn" onClick={()=>{URL.revokeObjectURL(s.audioUrl);updateScene(s.id,{audioBlob:null,audioUrl:null,duration:0})}}><Trash2 size={15}/></button></div>)}{assets.map(a=><div className="track-row" key={a.id}><div className="track-name"><span className={`track-icon ${a.type==='Música'?'music':'effect'}`}>{a.type==='Música'?<Music2 size={15}/>:<AudioLines size={15}/>}</span><div><b>{a.name}</b><small>Archivo importado</small></div></div><span className="type-chip">{a.type}</span><span className="track-volume"><input type="range" min="0" max="100" value={a.volume} onChange={e=>setAssets(p=>p.map(x=>x.id===a.id?{...x,volume:+e.target.value}:x))}/>{a.volume}%</span><button className="icon-btn" onClick={()=>deleteAsset(a.id)}><Trash2 size={15}/></button></div>)}{!assets.length&&!scenes.some(s=>s.audioBlob)&&<div className="empty-track"><AudioLines size={30}/><b>Tu línea de tiempo está vacía</b><span>Graba un diálogo o importa música y efectos de sonido.</span><button className="btn outline" onClick={()=>audioInputRef.current?.click()}><Upload size={15}/> Importar audio</button></div>}</div></section><aside className="panel master-panel"><h2><Settings2 size={18}/> Control maestro</h2><label className="field-label">VOLUMEN GENERAL <b>{master}%</b></label><input type="range" min="0" max="100" value={master} onChange={e=>setMaster(+e.target.value)}/><label className="field-label">MÚSICA DE FONDO <b>{musicVolume}%</b></label><input type="range" min="0" max="100" value={musicVolume} onChange={e=>setMusicVolume(+e.target.value)}/><div className="export-card"><Headphones size={22}/><b>Listo para exportar</b><p>Combina las grabaciones y pistas importadas en un solo capítulo.</p><button className="btn primary block" onClick={exportWav}><Download size={16}/> Exportar WAV</button><button className="btn outline block" onClick={exportMp3}><Download size={16}/> Exportar MP3</button></div></aside></div>}
      </section>
      <footer className="statusbar"><span><span className="status-light"/> {notice || 'Todos los cambios se guardan localmente al exportar el proyecto.'}</span><span>RadioNovela Studio · Versión 0.1.0</span></footer>
    </main>
  </div>;
}
