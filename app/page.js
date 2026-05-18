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

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function FileDropzone({ title, hint, accept, file, preview, type, onSelect, onRemove }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) onSelect(f);
  };

  return (
    <div className={`uploadCard ${drag ? "drag" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()}>
      <input ref={inputRef} type="file" accept={accept} onChange={(e) => onSelect(e.target.files?.[0])} hidden />
      <div className="uploadHead">
        <h4>{title}</h4>
        <span>{hint}</span>
      </div>
      {!file && <div className="uploadEmpty"><strong>Drag & drop</strong><p>atau klik untuk upload</p></div>}
      {file && (
        <div className="uploadPreviewWrap" onClick={(e) => e.stopPropagation()}>
          {type === "image" ? <img className="uploadPreview" src={preview} alt="Preview" /> : <video className="uploadPreview" controls src={preview} />}
          <div className="fileMeta">
            <p>{file.name}</p>
            <small>{formatSize(file.size)}</small>
            <button type="button" onClick={onRemove}>Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const [imageFile, setImageFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [videoPreview, setVideoPreview] = useState("");
  const [model, setModel] = useState("kling-v3-motion-control-std");
  const [prompt, setPrompt] = useState("");
  const [orientation, setOrientation] = useState("video");
  const [cfgScale, setCfgScale] = useState(0.5);
  const [status, setStatus] = useState("READY");
  const [taskId, setTaskId] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState("");
  const [raw, setRaw] = useState(null);
  const [history, setHistory] = useState([]);
  const pollingRef = useRef(null);
  const startRef = useRef(0);

  useEffect(() => {
    const h = JSON.parse(localStorage.getItem("motion-ai-history") || "[]");
    setHistory(h);
    const prevTask = JSON.parse(localStorage.getItem("motion-ai-last-task") || "null");
    if (prevTask?.taskId) {
      setTaskId(prevTask.taskId);
      setModel(prevTask.model || "kling-v3-motion-control-std");
      setStatus("IN_PROGRESS");
    }
  }, []);

  useEffect(() => () => pollingRef.current && clearInterval(pollingRef.current), []);

  const canGenerate = useMemo(() => imageFile && videoFile && !["UPLOADING", "GENERATING"].includes(status), [imageFile, videoFile, status]);

  const saveHistory = (item) => {
    const next = [{ ...item, date: new Date().toISOString() }, ...history].slice(0, 10);
    setHistory(next);
    localStorage.setItem("motion-ai-history", JSON.stringify(next));
  };

  const validateFile = (file, kind) => {
    if (!file) return `${kind === "image" ? "Image" : "Video"} wajib dipilih.`;
    if (kind === "image") {
      if (!ACCEPTED_IMAGE.includes(file.type)) return "Format image tidak didukung. Gunakan jpg/jpeg/png/webp.";
      if (file.size > 10 * 1024 * 1024) return "File image terlalu besar. Maksimal 10 MB.";
    }
    if (kind === "video") {
      if (!ACCEPTED_VIDEO.includes(file.type)) return "Format video tidak didukung. Gunakan mp4/mov/webm/m4v.";
      if (file.size > 30 * 1024 * 1024) return "File video terlalu besar. Maksimal 30 MB.";
    }
    return "";
  };

  const uploadToCloudinary = async (file) => {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !preset) throw new Error("Cloudinary belum dikonfigurasi. Isi NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME dan NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET.");
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", preset);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.secure_url) throw new Error(data?.error?.message || "Upload Cloudinary gagal. Pastikan upload preset unsigned sudah benar.");
    return data.secure_url;
  };

  const checkStatus = async (currentTaskId = taskId, currentModel = model, silent = false) => {
    if (!currentTaskId) return setError("Task ID kosong.");
    try {
      const ac = new AbortController();
      setTimeout(() => ac.abort(), 20000);
      const res = await fetch(`/api/status?taskId=${encodeURIComponent(currentTaskId)}&model=${encodeURIComponent(currentModel)}`, { signal: ac.signal });
      const data = await res.json();
      setRaw(data.raw || data);
      if (!res.ok || !data.success) throw new Error(data.error || "Gagal cek status.");
      setStatus(data.status || "IN_PROGRESS");
      if (data.videoUrl) setVideoUrl(data.videoUrl);
      if (["COMPLETED", "FAILED"].includes(data.status)) {
        pollingRef.current && clearInterval(pollingRef.current);
        saveHistory({ taskId: data.task_id, model: currentModel, status: data.status, videoUrl: data.videoUrl });
      } else if (!silent) {
        setError("Status masih IN_PROGRESS.");
      }
    } catch (e) {
      if (!silent) setError(e.message || "Status check gagal.");
    }
  };

  const startPolling = (currentTaskId, currentModel) => {
    pollingRef.current && clearInterval(pollingRef.current);
    startRef.current = Date.now();
    pollingRef.current = setInterval(() => {
      if (Date.now() - startRef.current > 300000) {
        clearInterval(pollingRef.current);
        setError("Auto polling berhenti setelah 5 menit. Gunakan tombol check status manual.");
        return;
      }
      checkStatus(currentTaskId, currentModel, true);
    }, 5000);
  };

  const onGenerate = async () => {
    setError("");
    setRaw(null);
    setVideoUrl("");
    try {
      const imageErr = validateFile(imageFile, "image");
      const videoErr = validateFile(videoFile, "video");
      if (imageErr || videoErr) throw new Error(imageErr || videoErr);

      setStatus("UPLOADING");
      const imageUrl = await uploadToCloudinary(imageFile);
      const uploadedVideoUrl = await uploadToCloudinary(videoFile);

      setStatus("GENERATING");
      const ac = new AbortController();
      setTimeout(() => ac.abort(), 25000);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({ imageUrl, videoUrl: uploadedVideoUrl, model, prompt, orientation, cfgScale })
      });
      const data = await res.json();
      setRaw(data.raw || data);
      if (!res.ok || !data.success) throw new Error(data.error || "Generate gagal.");

      setTaskId(data.task_id);
      setStatus(data.status || "IN_PROGRESS");
      localStorage.setItem("motion-ai-last-task", JSON.stringify({ taskId: data.task_id, model }));
      if (data.videoUrl) setVideoUrl(data.videoUrl);
      if ((data.status || "IN_PROGRESS") === "IN_PROGRESS") startPolling(data.task_id, model);
      saveHistory({ taskId: data.task_id, model, status: data.status || "IN_PROGRESS", videoUrl: data.videoUrl });
    } catch (e) {
      setStatus("FAILED");
      setError(e.message || "Generate gagal.");
    }
  };

  return (
    <main className="page">
      <div className="bgGlow" />
      <header className="hero card">
        <div>
          <p className="eyebrow">MOTION CONTROL AI STUDIO</p>
          <h1>MOTION.AI</h1>
          <p className="subtitle">Kling Motion Control Studio</p>
        </div>
        <span className="pwa">PWA Ready</span>
      </header>

      <section className="notice card">Gunakan gambar dan video referensi yang aman. Konten vulgar, ofensif, kekerasan ekstrem, atau melanggar hak cipta dapat menyebabkan task gagal.</section>

      <div className="dashboard">
        <section className="leftPane card">
          <div className="sectionTitle"><h3>Input Studio</h3><span>Status: {status}</span></div>

          <FileDropzone
            title="Reference Image"
            hint="jpg/jpeg/png/webp • maks 10 MB"
            accept="image/jpeg,image/png,image/webp"
            file={imageFile}
            preview={imagePreview}
            type="image"
            onSelect={(file) => { if (!file) return; setImageFile(file); setImagePreview(URL.createObjectURL(file)); }}
            onRemove={() => { setImageFile(null); setImagePreview(""); }}
          />

          <FileDropzone
            title="Reference Video"
            hint="mp4/mov/webm/m4v • maks 30 MB"
            accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
            file={videoFile}
            preview={videoPreview}
            type="video"
            onSelect={(file) => { if (!file) return; setVideoFile(file); setVideoPreview(URL.createObjectURL(file)); }}
            onRemove={() => { setVideoFile(null); setVideoPreview(""); }}
          />

          <div className="formGrid">
            <label>Model
              <select value={model} onChange={(e) => setModel(e.target.value)}>{MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
            </label>
            <label>Orientation
              <select value={orientation} onChange={(e) => setOrientation(e.target.value)}><option value="video">video</option><option value="image">image</option></select>
            </label>
          </div>

          <label>Prompt
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the motion style, camera movement, emotion, or cinematic direction..." />
          </label>

          <label>CFG Scale <b>{cfgScale.toFixed(2)}</b>
            <input type="range" min="0" max="1" step="0.01" value={cfgScale} onChange={(e) => setCfgScale(Number(e.target.value))} />
            <small>0 bebas, 1 lebih mengikuti prompt</small>
          </label>
        </section>

        <section className="rightPane card">
          <div className="resultHeader">
            <h3>Cinematic Result</h3>
            <span className={`badge ${status.toLowerCase()}`}>{status}</span>
          </div>
          <p className="task">Task ID: <code>{taskId || "-"}</code></p>
          <div className="actionRow">
            <button onClick={() => taskId && navigator.clipboard.writeText(taskId)}>Copy Task ID</button>
            <button onClick={() => checkStatus()}>Manual Check Status</button>
          </div>

          {videoUrl ? (
            <div className="resultVideoWrap">
              <video className="resultVideo" controls src={videoUrl} />
              <div className="actionRow">
                <a href={videoUrl} target="_blank">Open in new tab</a>
                <a href={videoUrl} download>Download</a>
              </div>
            </div>
          ) : <div className="videoPlaceholder">Hasil video akan tampil di sini setelah status COMPLETED.</div>}

          {error && <p className="error">{error}</p>}

          <details>
            <summary>Raw response debug</summary>
            <pre>{JSON.stringify(raw, null, 2)}</pre>
          </details>

          <div className="historyTop">
            <h4>History</h4>
            <button onClick={() => { setHistory([]); localStorage.removeItem("motion-ai-history"); }}>Clear</button>
          </div>
          <div className="historyList">
            {history.map((item, idx) => (
              <div key={`${item.taskId}-${idx}`} className="historyItem">
                <p>{new Date(item.date).toLocaleString()} • {item.status}</p>
                <small>{item.model}</small>
                {item.videoUrl && <video src={item.videoUrl} controls />}
                <button onClick={() => { setTaskId(item.taskId); setModel(item.model); setStatus(item.status); setVideoUrl(item.videoUrl || ""); }}>Restore</button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="stickyGenerate">
        <button className="generateBtn" disabled={!canGenerate} onClick={onGenerate}>
          {status === "UPLOADING" ? "Uploading to Cloudinary..." : status === "GENERATING" ? "Sending to Kling..." : "Generate Motion Video"}
        </button>
      </div>
    </main>
  );
}
