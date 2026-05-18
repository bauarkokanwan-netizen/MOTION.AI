import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ENDPOINTS = {
  "kling-v2-6-motion-control-std": "/v1/ai/video/kling-v2-6-motion-control-std",
  "kling-v2-6-motion-control-pro": "/v1/ai/video/kling-v2-6-motion-control-pro",
  "kling-v3-motion-control-std": "/v1/ai/video/kling-v3-motion-control-std",
  "kling-v3-motion-control-pro": "/v1/ai/video/kling-v3-motion-control-pro"
};

const withTimeout = async (url, options = {}, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const normalizeStatus = (status) => {
  const s = String(status || "").toUpperCase();
  if (["IN_PROGRESS", "PENDING", "PROCESSING", "QUEUED", "RUNNING"].includes(s)) return "IN_PROGRESS";
  if (["COMPLETED", "DONE", "SUCCESS", "FINISHED", "SUCCEEDED"].includes(s)) return "COMPLETED";
  if (["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(s)) return "FAILED";
  return s || "IN_PROGRESS";
};

const getTaskId = (d = {}) => d.task_id || d.id || d.uuid || d?.data?.task_id || d?.data?.id || d?.data?.uuid || d?.result?.task_id || d?.result?.id || d?.task?.id || d?.task?.task_id || null;
const getStatus = (d = {}) => d.status || d?.data?.status || d?.result?.status || d?.task?.status || null;
const getVideoUrl = (d = {}) => d.video_url || d.videoUrl || d.url || d?.data?.video_url || d?.data?.videoUrl || d?.data?.url || d?.result?.video_url || d?.result?.videoUrl || d?.result?.url || d?.generated?.[0] || d?.data?.generated?.[0] || d?.output?.[0] || d?.data?.output?.[0] || null;

const safeReadResponse = async (res) => {
  const contentType = res.headers.get("content-type") || "";
  const status = res.status;
  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status, contentType, data, responsePreview: JSON.stringify(data).slice(0, 500) };
  }
  const text = await res.text().catch(() => "");
  if (text.includes("Request Entity Too Large")) {
    return {
      ok: false,
      status,
      contentType,
      data: { error: "Request terlalu besar. Jangan upload file lewat API route. Gunakan Cloudinary direct upload." },
      responsePreview: text.slice(0, 500)
    };
  }
  return { ok: res.ok, status, contentType, data: { error: "Response bukan JSON", text }, responsePreview: text.slice(0, 500) };
};

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { imageUrl, videoUrl, model = "kling-v3-motion-control-std", prompt, orientation, cfgScale, provider = "freepik", apiKey: inputApiKey } = body;

    const apiKey = (inputApiKey || process.env.MAGNIFIC_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "API key kosong. Isi input API key atau set MAGNIFIC_API_KEY di environment variables." }, { status: 400 });
    }

    if (!imageUrl || !videoUrl) {
      return NextResponse.json({ success: false, error: "imageUrl dan videoUrl wajib diisi setelah upload Cloudinary selesai." }, { status: 400 });
    }

    const path = ENDPOINTS[model];
    if (!path) return NextResponse.json({ success: false, error: "Model tidak valid." }, { status: 400 });

    const payload = {
      image_url: imageUrl,
      video_url: videoUrl,
      character_orientation: orientation || "video",
      cfg_scale: Number(cfgScale ?? 0.5)
    };
    if (prompt?.trim()) payload.prompt = prompt.trim();

    const useFreepik = provider === "freepik";
    const baseURL = useFreepik ? "https://api.freepik.com" : "https://api.magnific.com";
    const authHeader = useFreepik ? { "x-freepik-api-key": apiKey } : { "x-magnific-api-key": apiKey };

    const res = await withTimeout(`${baseURL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader
      },
      body: JSON.stringify(payload)
    });

    const parsed = await safeReadResponse(res);
    const raw = parsed.data;

    if (!parsed.ok) {
      const text = JSON.stringify(raw || {});
      const unknownKey = JSON.stringify(raw || {}).toLowerCase().includes("unknown api key");
      const error = unknownKey
        ? "API key tidak dikenali. Pastikan provider benar: pilih Freepik jika memakai Freepik API key, atau Magnific jika memakai Magnific API key."
        : (raw?.error || (parsed.status === 401 ? "Unauthorized / API key salah." : "Generate gagal."));
      return NextResponse.json({ success: false, error, status: parsed.status, contentType: parsed.contentType, responsePreview: parsed.responsePreview, raw }, { status: res.status });
    }

    const task_id = getTaskId(raw);
    const status = normalizeStatus(getStatus(raw));
    const resultVideoUrl = getVideoUrl(raw);

    if (!task_id) {
      return NextResponse.json({ success: false, error: "Task ID kosong dari response generate.", raw }, { status: 502 });
    }

    return NextResponse.json({ success: true, model, provider, task_id, status, videoUrl: resultVideoUrl, raw });
  } catch (error) {
    if (error?.name === "AbortError") {
      return NextResponse.json({ success: false, error: "Generate timeout. Coba lagi." }, { status: 504 });
    }
    return NextResponse.json({ success: false, error: "Generate gagal karena error server.", detail: String(error?.message || error) }, { status: 500 });
  }
}

export { getTaskId, getStatus, getVideoUrl, normalizeStatus, safeReadResponse };
