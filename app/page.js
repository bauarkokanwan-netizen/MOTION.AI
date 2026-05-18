"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MODELS = [
  { label: "Kling 3 Standard", value: "kling-v3-motion-control-std", tag: "Recommended" },
  { label: "Kling 3 Pro", value: "kling-v3-motion-control-pro", tag: "Pro" },
  { label: "Kling 2.6 Standard", value: "kling-v2-6-motion-control-std", tag: "Stable" },
  { label: "Kling 2.6 Pro", value: "kling-v2-6-motion-control-pro", tag: "Pro" }
];

const QUICK_PROMPTS = ["cinematic push in", "slow hair movement", "dynamic dance motion", "dramatic camera shake"];
const ACCEPTED_IMAGE = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ACCEPTED_VIDEO = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];
const MAX_PROMPT = 1000;

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const statusText = (status) => status === "UPLOADING" ? "Uploading assets..." : status === "GENERATING" ? "Creating task..." : status === "IN_PROGRESS" ? "Processing video..." : "Generate Motion Video ✨";

function Dropzone({ title, subtitle, file, preview, type, accept, onSelect, onRemove, validBadge, videoDuration }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) onSelect(f);
  };

  return (
    <label className={`dropzone ${drag ? "drag" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={handleDrop}>
      <input ref={ref} type="file" accept={accept} onChange={(e) => onSelect(e.target.files?.[0])} />
      <div className="dropHead">
        <div>
          <h4>{title}</h4>
          <p>{subtitle}</p>
        </div>
        {validBadge ? <span className="okBadge">OK</span> : null}
      </div>

      {!file ? (
        <div className="dropEmpty">
          <div className="dropIcon">{type === "image" ? "🖼" : "🎬"}</div>
          <strong>{type === "image" ? "Drop image here or click to browse" : "Drop motion reference video"}</strong>
        </div>
      ) : (
        <div className="previewWrap" onClick={(e) => e.preventDefault()}>
          {type === "image" ? <img src={preview} alt="Image preview" className="previewAsset" /> : <video src={preview} controls className="previewAsset" />}
          <div className="metaRow">
            <div>
              <p>{file.name}</p>
              <small>{formatSize(file.size)} {videoDuration ? `• ${videoDuration}s` : ""}</small>
            </div>
            <button type="button" className="ghostBtn" onClick={onRemove}>Remove</button>
          </div>
        </div>
      )}
    </label>
  );
}

export default function Page() {
  const [imageFile, setImageFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [videoPreview, setVideoPreview] = useState("");
  const [videoDuration, setVideoDuration] = useState("");
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
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [provider, setProvider] = useState("freepik");
  const pollingRef = useRef(null);
  const startRef = useRef(0);

  useEffect(() => {
    setHistory(JSON.parse(localStorage.getItem("motion-ai-history") || "[]"));
    const prevTask = JSON.parse(localStorage.getItem("motion-ai-last-task") || "null");
    if (prevTask?.taskId) {
      setTaskId(prevTask.taskId);
      setModel(prevTask.model || "kling-v3-motion-control-std");
      setProvider(prevTask.provider || "freepik");
      setStatus("IN_PROGRESS");
    }
  }, []);

  useEffect(() => () => pollingRef.current && clearInterval(pollingRef.current), []);

  const canGenerate = useMemo(() => imageFile && videoFile && !["UPLOADING", "GENERATING", "IN_PROGRESS"].includes(status), [imageFile, videoFile, status]);
  const stepState = useMemo(() => ({
    uploading: ["UPLOADING", "GENERATING", "IN_PROGRESS", "COMPLETED"].includes(status),
    generating: ["GENERATING", "IN_PROGRESS", "COMPLETED"].includes(status),
    processing: ["IN_PROGRESS", "COMPLETED"].includes(status),
    completed: status === "COMPLETED"
  }), [status]);

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
      const res = await fetch(`/api/status?taskId=${encodeURIComponent(currentTaskId)}&model=${encodeURIComponent(currentModel)}&provider=${encodeURIComponent(provider)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({ taskId: currentTaskId, model: currentModel, provider, apiKey: apiKeyInput.trim() || undefined })
      });
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
        body: JSON.stringify({ imageUrl, videoUrl: uploadedVideoUrl, model, prompt, orientation, cfgScale, provider, apiKey: apiKeyInput.trim() || undefined })
      });
      const data = await res.json();
      setRaw(data.raw || data);
      if (!res.ok || !data.success) throw new Error(data.error || "Generate gagal.");
      setTaskId(data.task_id);
      setStatus(data.status || "IN_PROGRESS");
      localStorage.setItem("motion-ai-last-task", JSON.stringify({ taskId: data.task_id, model, provider }));
      if (data.videoUrl) setVideoUrl(data.videoUrl);
      if ((data.status || "IN_PROGRESS") === "IN_PROGRESS") startPolling(data.task_id, model);
      saveHistory({ taskId: data.task_id, model, status: data.status || "IN_PROGRESS", videoUrl: data.videoUrl });
    } catch (e) {
      setStatus("FAILED");
      setError(e.message || "Generate gagal.");
    }
  };

  const shortTaskId = taskId ? `${taskId.slice(0, 10)}...${taskId.slice(-6)}` : "No task yet";

  return (
    <main className="appShell">
      <div className="bgLayers" />

      <header className="hero panel fadeIn">
        <div className="heroLeft">
          <div className="logoTri">▶</div>
          <div>
            <h1>MOTION.AI</h1>
            <p className="heroSub">Kling Motion Control Studio</p>
            <small>Image + reference video to AI motion generation</small>
          </div>
        </div>
        <div className="heroBadges">
          <span>PWA Ready</span>
          <span>Cloud Upload</span>
          <span>Mobile Support</span>
        </div>
      </header>

      <section className="safety panel amber fadeIn">
        <strong>⚠ Safety Notice</strong>
        <p>Gunakan gambar dan video referensi yang aman. Konten vulgar, ofensif, kekerasan ekstrem, atau melanggar hak cipta dapat menyebabkan task gagal.</p>
      </section>

      <section className="mainGrid">
        <div className="panel left fadeIn">
          <h2>Create Motion Video</h2>

          <div className="subPanel">
            <label>Magnific / Freepik API Key</label>
            <div className="keyInputWrap">
              <input type={showApiKey ? "text" : "password"} value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="Optional API key input (not stored)" />
              <button type="button" className="ghostBtn" onClick={() => setShowApiKey((v) => !v)}>{showApiKey ? "Hide" : "Show"}</button>
            </div>
            <small>Kosongkan jika admin sudah mengatur MAGNIFIC_API_KEY di Vercel. API key user tidak disimpan.</small>
            <label className="providerLabel">API Provider</label>
            <div className="providerSwitch">
              <button type="button" className={provider === "freepik" ? "active" : ""} onClick={() => setProvider("freepik")}>Freepik</button>
              <button type="button" className={provider === "magnific" ? "active" : ""} onClick={() => setProvider("magnific")}>Magnific</button>
            </div>
          </div>

          <Dropzone
            title="Reference Image"
            subtitle="JPG, PNG, WEBP up to 10MB"
            file={imageFile}
            preview={imagePreview}
            type="image"
            accept="image/jpeg,image/png,image/webp"
            validBadge={!!imageFile && !validateFile(imageFile, "image")}
            onSelect={(file) => { if (!file) return; setImageFile(file); setImagePreview(URL.createObjectURL(file)); }}
            onRemove={() => { setImageFile(null); setImagePreview(""); }}
          />

          <Dropzone
            title="Reference Video"
            subtitle="MP4, MOV, WEBM up to 30MB, recommended 3–10s"
            file={videoFile}
            preview={videoPreview}
            type="video"
            accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
            validBadge={!!videoFile && !validateFile(videoFile, "video")}
            videoDuration={videoDuration}
            onSelect={(file) => {
              if (!file) return;
              setVideoFile(file);
              const url = URL.createObjectURL(file);
              setVideoPreview(url);
              const probe = document.createElement("video");
              probe.preload = "metadata";
              probe.src = url;
              probe.onloadedmetadata = () => setVideoDuration(Number(probe.duration || 0).toFixed(1));
            }}
            onRemove={() => { setVideoFile(null); setVideoPreview(""); setVideoDuration(""); }}
          />

          <div className="modelGrid">
            {MODELS.map((item) => (
              <button key={item.value} className={`modelCard ${model === item.value ? "active" : ""}`} onClick={() => setModel(item.value)}>
                <strong>{item.label}</strong>
                <small>{item.tag}</small>
              </button>
            ))}
          </div>

          <div className="segmentWrap">
            <button className={orientation === "video" ? "active" : ""} onClick={() => setOrientation("video")}>Video</button>
            <button className={orientation === "image" ? "active" : ""} onClick={() => setOrientation("image")}>Image</button>
          </div>

          <div className="sliderBlock">
            <div><label>CFG Scale</label><span>{cfgScale.toFixed(2)}</span></div>
            <input type="range" min="0" max="1" step="0.01" value={cfgScale} onChange={(e) => setCfgScale(Number(e.target.value))} />
            <small>0 bebas, 1 lebih mengikuti prompt</small>
          </div>

          <div className="promptWrap">
            <label>Prompt</label>
            <textarea maxLength={MAX_PROMPT} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe motion style, camera movement, emotion, cinematic direction..." />
            <div className="promptFooter"><small>{prompt.length}/{MAX_PROMPT}</small></div>
            <div className="chips">{QUICK_PROMPTS.map((chip) => <button key={chip} className="chip" onClick={() => setPrompt((p) => `${p}${p ? ", " : ""}${chip}`)}>{chip}</button>)}</div>
          </div>
          <button className={`generateBtn inlineGenerate ${status === "IN_PROGRESS" ? "pulse" : ""}`} disabled={!canGenerate} onClick={onGenerate}>{statusText(status)}</button>
          <small className="generateHint">Pastikan image dan video sudah sesuai sebelum generate.</small>

        </div>

        <div className="panel right fadeIn">
          <h2>Status & Result</h2>
          <div className={`statusBadge ${status.toLowerCase()}`}>{status}</div>

          <div className="steps">
            <span className={stepState.uploading ? "on" : ""}>Uploading</span>
            <span className={stepState.generating ? "on" : ""}>Generating</span>
            <span className={stepState.processing ? "on" : ""}>Processing</span>
            <span className={stepState.completed ? "on" : ""}>Completed</span>
          </div>

          <div className="taskCard">
            <p>{shortTaskId}</p>
            <div className="taskActions">
              <button className="ghostBtn" onClick={() => taskId && navigator.clipboard.writeText(taskId)}>Copy Task ID</button>
              <button className="ghostBtn" onClick={() => checkStatus()}>Manual Check Status</button>
            </div>
          </div>

          <div className="resultArea">
            {videoUrl ? (
              <>
                <video className="resultVideo" controls src={videoUrl} />
                <div className="taskActions">
                  <a href={videoUrl} target="_blank">Open in New Tab</a>
                  <a href={videoUrl} download>Download</a>
                  <button className="ghostBtn" onClick={onGenerate}>Generate Again</button>
                </div>
              </>
            ) : (
              <div className="emptyState">
                <div className="dropIcon">🎞</div>
                <h3>Your generated motion video will appear here</h3>
                <p>Upload image and reference video to begin</p>
              </div>
            )}
          </div>

          {error ? <div className="errorBox">❌ {error}</div> : null}

          <details open={!!error}>
            <summary>Raw response debug</summary>
            <pre>{JSON.stringify(raw, null, 2)}</pre>
          </details>
        </div>
      </section>

      <section className="panel historySection fadeIn">
        <div className="historyHead">
          <h2>Recent Generations</h2>
          <button className="ghostBtn" onClick={() => { setHistory([]); localStorage.removeItem("motion-ai-history"); }}>Clear History</button>
        </div>
        {!history.length ? (
          <div className="emptyHistory">No generation yet. Start with image + motion video.</div>
        ) : (
          <div className="historyGrid">
            {history.map((item, idx) => (
              <article key={`${item.taskId}-${idx}`} className="historyCard">
                <span className={`miniStatus ${String(item.status || "").toLowerCase()}`}>{item.status}</span>
                <small>{item.model}</small>
                <p>{new Date(item.date).toLocaleString()}</p>
                <code>{item.taskId?.slice(0, 8)}...{item.taskId?.slice(-5)}</code>
                {item.videoUrl ? <video src={item.videoUrl} controls /> : <div className="noThumb">No preview</div>}
                <button className="ghostBtn" onClick={() => { setTaskId(item.taskId); setModel(item.model); setStatus(item.status); setVideoUrl(item.videoUrl || ""); }}>Restore</button>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="stickyCta">
        <button className={`generateBtn ${status === "IN_PROGRESS" ? "pulse" : ""}`} disabled={!canGenerate} onClick={onGenerate}>{statusText(status)}</button>
      </div>
    </main>
  );
}
