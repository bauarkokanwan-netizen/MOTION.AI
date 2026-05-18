export const runtime = "nodejs";

const ENDPOINTS = {
  "kling-v2-6-motion-control-std": "/v1/ai/video/kling-v2-6-motion-control-std",
  "kling-v2-6-motion-control-pro": "/v1/ai/video/kling-v2-6-motion-control-pro",
  "kling-v3-motion-control-std": "/v1/ai/video/kling-v3-motion-control-std",
  "kling-v3-motion-control-pro": "/v1/ai/video/kling-v3-motion-control-pro",
};

function getTaskId(data) {
  return (
    data?.task_id ||
    data?.id ||
    data?.uuid ||
    data?.data?.task_id ||
    data?.data?.id ||
    data?.data?.uuid ||
    data?.result?.task_id ||
    data?.result?.id ||
    data?.task?.id ||
    data?.task?.task_id ||
    null
  );
}

function getVideoUrl(data) {
  return (
    data?.video_url ||
    data?.videoUrl ||
    data?.url ||
    data?.data?.video_url ||
    data?.data?.videoUrl ||
    data?.data?.url ||
    data?.result?.video_url ||
    data?.result?.videoUrl ||
    data?.result?.url ||
    null
  );
}

async function readApiResponse(res) {
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = await res.json().catch(() => ({}));
    return {
      ok: true,
      type: "json",
      data: json,
      rawText: null,
      contentType,
    };
  }

  const text = await res.text().catch(() => "");

  return {
    ok: false,
    type: "text",
    data: {},
    rawText: text,
    contentType,
  };
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return Response.json(
        {
          error: "Request body bukan JSON yang valid.",
        },
        { status: 400 }
      );
    }

    const apiKey = body.apiKey || process.env.MAGNIFIC_API_KEY || process.env.FREEPIK_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          error: "API key kosong. Isi di form atau set MAGNIFIC_API_KEY / FREEPIK_API_KEY di Vercel.",
        },
        { status: 400 }
      );
    }

    if (!body.imageUrl || !body.videoUrl) {
      return Response.json(
        {
          error: "imageUrl dan videoUrl wajib ada. Upload file dulu atau isi URL publik.",
        },
        { status: 400 }
      );
    }

    const model = body.model || "kling-v3-motion-control-std";
    const endpoint = ENDPOINTS[model];

    if (!endpoint) {
      return Response.json(
        {
          error: "Model tidak dikenal.",
          allowedModels: Object.keys(ENDPOINTS),
        },
        { status: 400 }
      );
    }

    const cfgScale = Number(body.cfgScale ?? 0.5);

    const payload = {
      image_url: body.imageUrl,
      video_url: body.videoUrl,
      character_orientation: body.orientation || "video",
      cfg_scale: Number.isFinite(cfgScale) ? cfgScale : 0.5,
    };

    if (body.prompt && String(body.prompt).trim()) {
      payload.prompt = String(body.prompt).trim();
    }

    const res = await fetch(`https://api.freepik.com${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-freepik-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const parsed = await readApiResponse(res);

    if (!parsed.type.includes("json")) {
      return Response.json(
        {
          error:
            parsed.rawText ||
            `Server tidak mengembalikan JSON. HTTP ${res.status}`,
          detail: {
            status: res.status,
            contentType: parsed.contentType,
            responsePreview: parsed.rawText?.slice(0, 500) || null,
          },
        },
        { status: res.ok ? 502 : res.status }
      );
    }

    const data = parsed.data;

    if (!res.ok) {
      return Response.json(
        {
          error:
            data?.message ||
            data?.error ||
            data?.detail ||
            data?.data?.message ||
            data?.data?.error ||
            `Generate gagal. HTTP ${res.status}`,
          detail: data,
        },
        { status: res.status }
      );
    }

    const taskId = getTaskId(data);
    const videoUrl = getVideoUrl(data);

    return Response.json({
      success: true,
      model,
      task_id: taskId,
      video_url: videoUrl,
      raw: data,
    });
  } catch (err) {
    return Response.json(
      {
        error: err?.message || "Generate error.",
      },
      { status: 500 }
    );
  }
}
