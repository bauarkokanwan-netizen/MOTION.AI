"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MODELS = [
  { label: "Kling 2.6 Standard", value: "kling-v2-6-motion-control-std" },
  { label: "Kling 2.6 Pro", value: "kling-v2-6-motion-control-pro" },
  { label: "Kling 3 Standard", value: "kling-v3-motion-control-std" },
  { label: "Kling 3 Pro", value: "kling-v3-motion-control-pro" }
];
const ACCEPTED_IMAGE = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ACCEPTED_VIDEO = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];

const fmt = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

export default function Page() {
  const [imageFile, setImageFile] = useState(null); const [videoFile, setVideoFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(""); const [videoPreview, setVideoPreview] = useState("");
  const [model, setModel] = useState("kling-v3-motion-control-std"); const [prompt, setPrompt] = useState("");
  const [orientation, setOrientation] = useState("video"); const [cfgScale, setCfgScale] = useState(0.5);
  const [status, setStatus] = useState("READY"); const [taskId, setTaskId] = useState(""); const [videoUrl, setVideoUrl] = useState("");
  const [raw, setRaw] = useState(null); const [error, setError] = useState(""); const [history, setHistory] = useState([]);
  const pollingRef = useRef(null); const startedRef = useRef(0);

  useEffect(() => { setHistory(JSON.parse(localStorage.getItem("motion-ai-history") || "[]")); const t = localStorage.getItem("motion-ai-last-task"); if (t) { const p = JSON.parse(t); setTaskId(p.taskId || ""); setModel(p.model || "kling-v3-motion-control-std"); if (p.taskId) setStatus("IN_PROGRESS"); } }, []);
  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  const canGenerate = useMemo(() => imageFile && videoFile && ["READY", "FAILED", "COMPLETED"].includes(status), [imageFile, videoFile, status]);

  const validateFile = (file, type) => {
    if (!file) return "File tidak ada.";
    if (type === "image") { if (!ACCEPTED_IMAGE.includes(file.type)) return "Format image tidak didukung. Gunakan jpg/jpeg/png/webp."; if (file.size > 10 * 1024 * 1024) return "File image terlalu besar. Maksimal 10 MB."; }
    if (type === "video") { if (!ACCEPTED_VIDEO.includes(file.type)) return "Format video tidak didukung. Gunakan mp4/mov/webm/m4v."; if (file.size > 30 * 1024 * 1024) return "File video terlalu besar. Maksimal 30 MB."; }
    return "";
  };

  const uploadToCloudinary = async (file, resourceType) => {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !preset) throw new Error("Cloudinary belum dikonfigurasi. Isi NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME dan NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET.");
    const form = new FormData(); form.append("file", file); form.append("upload_preset", preset);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.secure_url) throw new Error(data?.error?.message || "Upload Cloudinary gagal. Pastikan upload preset unsigned sudah benar.");
    return data.secure_url;
  };

  const pollStatus = (inTaskId, inModel) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    startedRef.current = Date.now();
    pollingRef.current = setInterval(async () => {
      if (Date.now() - startedRef.current > 300000) { clearInterval(pollingRef.current); setError("Auto polling berhenti setelah 5 menit. Gunakan tombol Check Status manual."); return; }
      await checkStatus(inTaskId, inModel, true);
    }, 5000);
  };

  const checkStatus = async (inTaskId = taskId, inModel = model, silent = false) => {
    if (!inTaskId) { setError("Task ID kosong."); return; }
    try {
      const controller = new AbortController(); setTimeout(() => controller.abort(), 20000);
      const res = await fetch(`/api/status?taskId=${encodeURIComponent(inTaskId)}&model=${encodeURIComponent(inModel)}`, { signal: controller.signal });
      const data = await res.json(); setRaw(data.raw || data);
      if (!res.ok || !data.success) throw new Error(data.error || "Gagal cek status.");
      setStatus(data.status || "IN_PROGRESS"); if (data.videoUrl) setVideoUrl(data.videoUrl);
      if (data.status === "COMPLETED" || data.status === "FAILED") {
        if (pollingRef.current) clearInterval(pollingRef.current);
        if (data.status === "FAILED") setError("Status FAILED. Silakan ubah prompt/input lalu coba lagi.");
        saveHistory({ taskId: data.task_id, model: inModel, status: data.status, videoUrl: data.videoUrl });
      } else if (!silent) setError("Status masih IN_PROGRESS.");
    } catch (e) { if (!silent) setError(e.message || "Status check gagal."); }
  };

  const saveHistory = (item) => {
    const next = [{ ...item, date: new Date().toISOString() }, ...history].slice(0, 10);
    setHistory(next); localStorage.setItem("motion-ai-history", JSON.stringify(next));
  };

  const onGenerate = async () => {
    setError(""); setRaw(null); setVideoUrl(""); setStatus("UPLOADING");
    try {
      const iErr = validateFile(imageFile, "image"); const vErr = validateFile(videoFile, "video"); if (iErr || vErr) throw new Error(iErr || vErr);
      const imageUrl = await uploadToCloudinary(imageFile, "image");
      const videoUrlCloud = await uploadToCloudinary(videoFile, "video");
      setStatus("GENERATING");
      const controller = new AbortController(); setTimeout(() => controller.abort(), 25000);
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ imageUrl, videoUrl: videoUrlCloud, model, prompt, orientation, cfgScale }) });
      const data = await res.json(); setRaw(data.raw || data);
      if (!res.ok || !data.success) throw new Error(data.error || "Generate gagal");
      setTaskId(data.task_id); setStatus(data.status || "IN_PROGRESS");
      localStorage.setItem("motion-ai-last-task", JSON.stringify({ taskId: data.task_id, model }));
      if (data.videoUrl) setVideoUrl(data.videoUrl);
      if ((data.status || "IN_PROGRESS") === "IN_PROGRESS") pollStatus(data.task_id, model);
      saveHistory({ taskId: data.task_id, model, status: data.status || "IN_PROGRESS", videoUrl: data.videoUrl });
    } catch (e) { setStatus("FAILED"); setError(e.message || "Generate gagal."); }
  };

  return <main className="container">
    <header className="header card"><div><h1>MOTION.AI</h1><p>Kling Motion Control Studio</p></div><span className="badge">PWA Ready</span></header>
    <section className="notice card">Gunakan gambar dan video referensi yang aman. Konten vulgar, ofensif, kekerasan ekstrem, atau melanggar hak cipta dapat menyebabkan task gagal.</section>
    <div className="grid">
      <section className="card">
        <h3>Reference Image</h3>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>{const f=e.target.files?.[0];setImageFile(f||null);setImagePreview(f?URL.createObjectURL(f):"");}} />
        {imageFile && <p>{imageFile.name} • {fmt(imageFile.size)} <button onClick={()=>{setImageFile(null);setImagePreview("");}}>Remove</button></p>}
        {imagePreview && <img src={imagePreview} alt="preview" className="preview" />}
        <h3>Reference Video</h3>
        <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" onChange={(e)=>{const f=e.target.files?.[0];setVideoFile(f||null);setVideoPreview(f?URL.createObjectURL(f):"");}} />
        {videoFile && <p>{videoFile.name} • {fmt(videoFile.size)} <button onClick={()=>{setVideoFile(null);setVideoPreview("");}}>Remove</button></p>}
        {videoPreview && <video className="preview" controls src={videoPreview} />}
        <p className="hint">Rekomendasi video 3–10 detik. Testing cepat 2–5 MB.</p>
        <label>Model<select value={model} onChange={(e)=>setModel(e.target.value)}>{MODELS.map((m)=><option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
        <label>Prompt<textarea placeholder="Describe the motion style, camera movement, emotion, or cinematic direction..." value={prompt} onChange={(e)=>setPrompt(e.target.value)} /></label>
        <label>Orientation<select value={orientation} onChange={(e)=>setOrientation(e.target.value)}><option value="video">video</option><option value="image">image</option></select></label>
        <label>CFG Scale ({cfgScale})<input type="range" min="0" max="1" step="0.01" value={cfgScale} onChange={(e)=>setCfgScale(Number(e.target.value))} /></label>
        <p className="hint">0 bebas, 1 lebih mengikuti prompt</p>
      </section>
      <section className="card">
        <h3>Result</h3><span className={`status ${status.toLowerCase()}`}>{status}</span>
        <p>Task ID: {taskId || "-"}</p>
        <div className="actions"><button onClick={()=>taskId&&navigator.clipboard.writeText(taskId)}>Copy Task ID</button><button onClick={()=>checkStatus()}>Manual Check Status</button></div>
        {videoUrl && <><video className="preview" controls src={videoUrl} /><div className="actions"><a href={videoUrl} target="_blank">Open</a><a href={videoUrl} download>Download</a></div></>}
        {error && <p className="error">{error}</p>}
        <details><summary>Raw response debug</summary><pre>{JSON.stringify(raw, null, 2)}</pre></details>
        <h4>History</h4>
        <button onClick={()=>{setHistory([]);localStorage.removeItem("motion-ai-history");}}>Clear History</button>
        <div className="history">{history.map((h, i)=><div key={i} className="historyItem"><p>{new Date(h.date).toLocaleString()} • {h.model} • {h.status}</p>{h.videoUrl && <video src={h.videoUrl} controls />}<button onClick={()=>{setTaskId(h.taskId);setModel(h.model);setStatus(h.status);setVideoUrl(h.videoUrl||"");}}>Restore</button></div>)}</div>
      </section>
    </div>
    <div className="sticky"><button disabled={!canGenerate} onClick={onGenerate}>{status==="UPLOADING"?"Uploading...":status==="GENERATING"?"Generating...":"Generate Motion Video"}</button></div>
  </main>;
}
