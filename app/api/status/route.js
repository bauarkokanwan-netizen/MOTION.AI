import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ENDPOINTS = {
  "kling-v2-6-motion-control-std": "/v1/ai/video/kling-v2-6-motion-control-std",
  "kling-v2-6-motion-control-pro": "/v1/ai/video/kling-v2-6-motion-control-pro",
  "kling-v3-motion-control-std": "/v1/ai/video/kling-v3-motion-control-std",
  "kling-v3-motion-control-pro": "/v1/ai/video/kling-v3-motion-control-pro"
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
  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data, contentType, status: res.status, responsePreview: JSON.stringify(data).slice(0, 500) };
  }
  const text = await res.text().catch(() => "");
  if (text.includes("Request Entity Too Large")) {
    return { ok: false, data: { error: "Request terlalu besar. Jangan upload file lewat API route. Gunakan Cloudinary direct upload." }, contentType, status: res.status, responsePreview: text.slice(0, 500) };
  }
  return { ok: res.ok, data: { error: "Response bukan JSON", text }, contentType, status: res.status, responsePreview: text.slice(0, 500) };
};

async function getPayload(request) {
  const url = new URL(request.url);
  const queryTaskId = url.searchParams.get("taskId");
  const queryModel = url.searchParams.get("model");
  const queryProvider = url.searchParams.get("provider");

  if (queryTaskId) return { taskId: queryTaskId, model: queryModel, provider: queryProvider, apiKey: url.searchParams.get("apiKey") || "" };
  const body = await request.json().catch(() => ({}));
  return { taskId: body.taskId, model: body.model, provider: body.provider, apiKey: body.apiKey };
}

async function handle(request) {
  const { taskId, model = "kling-v3-motion-control-std", provider = "freepik", apiKey: inputApiKey } = await getPayload(request);
  const apiKey = (inputApiKey || process.env.MAGNIFIC_API_KEY || "").trim();
  if (!apiKey) {
    return NextResponse.json({ success: false, error: "API key kosong. Isi input API key atau set MAGNIFIC_API_KEY di environment variables." }, { status: 400 });
  }
  if (!taskId) {
    return NextResponse.json({ success: false, error: "taskId kosong. Silakan kirim taskId via query string atau JSON body." }, { status: 400 });
  }
  const path = ENDPOINTS[model];
  if (!path) return NextResponse.json({ success: false, error: "Model tidak valid." }, { status: 400 });

  const useFreepik = provider === "freepik";
  const baseURL = useFreepik ? "https://api.freepik.com" : "https://api.magnific.com";
  const authHeader = useFreepik ? { "x-freepik-api-key": apiKey } : { "x-magnific-api-key": apiKey };
  const res = await fetch(`${baseURL}${path}/${taskId}`, { headers: authHeader });
  const parsed = await safeReadResponse(res);
  if (!parsed.ok) {
    const unknownKey = JSON.stringify(parsed.data || {}).toLowerCase().includes("unknown api key");
    const error = unknownKey ? "API key tidak dikenali. Pastikan provider benar: pilih Freepik jika memakai Freepik API key, atau Magnific jika memakai Magnific API key." : (parsed.data?.error || (parsed.status === 401 ? "Unauthorized / API key salah." : parsed.status === 429 ? "Rate limit tercapai. Coba lagi sebentar." : "Gagal cek status."));
    return NextResponse.json({ success: false, error, status: parsed.status, contentType: parsed.contentType, responsePreview: parsed.responsePreview, raw: parsed.data }, { status: res.status });
  }

  const raw = parsed.data;
  return NextResponse.json({
    success: true,
    task_id: getTaskId(raw) || taskId,
    model,
    provider,
    status: normalizeStatus(getStatus(raw)),
    videoUrl: getVideoUrl(raw),
    raw
  });
}

export async function GET(request) {
  try { return await handle(request); } catch (error) { return NextResponse.json({ success: false, error: "Status check gagal.", detail: String(error?.message || error) }, { status: 500 }); }
}

export async function POST(request) {
  try { return await handle(request); } catch (error) { return NextResponse.json({ success: false, error: "Status check gagal.", detail: String(error?.message || error) }, { status: 500 }); }
}
