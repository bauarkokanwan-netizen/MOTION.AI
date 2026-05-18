export const runtime = "nodejs";

const ENDPOINTS = {
  "kling-v2-6-motion-control-std": "/v1/ai/video/kling-v2-6-motion-control-std",
  "kling-v2-6-motion-control-pro": "/v1/ai/video/kling-v2-6-motion-control-pro",
  "kling-v3-motion-control-std": "/v1/ai/video/kling-v3-motion-control-std",
  "kling-v3-motion-control-pro": "/v1/ai/video/kling-v3-motion-control-pro",
};

function normalizeProvider(provider) {
  const p = String(provider || "magnific").toLowerCase();

  if (p === "freepik") {
    return {
      provider: "freepik",
      baseURL: "https://api.freepik.com",
      headerName: "x-freepik-api-key",
    };
  }

  return {
    provider: "magnific",
    baseURL: "https://api.magnific.com",
    headerName: "x-magnific-api-key",
  };
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
    data?.generated?.[0] ||
    data?.data?.generated?.[0] ||
    data?.output?.[0] ||
    data?.data?.output?.[0] ||
    null
  );
}

function getStatus(data) {
  return (
    data?.status ||
    data?.data?.status ||
    data?.result?.status ||
    data?.task?.status ||
    null
  );
}

function normalizeStatus(status) {
  const s = String(status || "").toUpperCase();

  if (["COMPLETED", "DONE", "SUCCESS", "FINISHED", "SUCCEEDED"].includes(s)) {
    return "COMPLETED";
  }

  if (["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(s)) {
    return "FAILED";
  }

  if (["IN_PROGRESS", "PENDING", "PROCESSING", "QUEUED", "RUNNING"].includes(s)) {
    return "IN_PROGRESS";
  }

  return s || "UNKNOWN";
}

async function safeReadResponse(res) {
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    return {
      isJson: true,
      data,
      text: "",
      contentType,
    };
  }

  const text = await res.text().catch(() => "");

  return {
    isJson: false,
    data: {},
    text,
    contentType,
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const taskId = searchParams.get("taskId");
    const model =
      searchParams.get("model") || "kling-v3-motion-control-std";
    const provider = searchParams.get("provider") || "magnific";

    const providerConfig = normalizeProvider(provider);

    const apiKey =
      searchParams.get("apiKey") ||
      req.headers.get("x-user-api-key") ||
      process.env.MAGNIFIC_API_KEY ||
      process.env.FREEPIK_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          success: false,
          error:
            "API key kosong. Isi API key di form atau set MAGNIFIC_API_KEY di Vercel.",
          debug: {
            provider: providerConfig.provider,
            baseURL: providerConfig.baseURL,
            authHeaderName: providerConfig.headerName,
          },
        },
        { status: 400 }
      );
    }

    if (!taskId) {
      return Response.json(
        { success: false, error: "Task ID kosong." },
        { status: 400 }
      );
    }

    const endpoint = ENDPOINTS[model];

    if (!endpoint) {
      return Response.json(
        {
          success: false,
          error: "Model tidak dikenal.",
          allowedModels: Object.keys(ENDPOINTS),
        },
        { status: 400 }
      );
    }

    const res = await fetch(
      `${providerConfig.baseURL}${endpoint}/${encodeURIComponent(taskId)}`,
      {
        method: "GET",
        headers: {
          [providerConfig.headerName]: apiKey,
        },
      }
    );

    const parsed = await safeReadResponse(res);
    const data = parsed.data;

    const debug = {
      provider: providerConfig.provider,
      baseURL: providerConfig.baseURL,
      endpoint: `${endpoint}/${taskId}`,
      authHeaderName: providerConfig.headerName,
      status: res.status,
      contentType: parsed.contentType,
      responsePreview: parsed.isJson
        ? JSON.stringify(data).slice(0, 500)
        : parsed.text.slice(0, 500),
    };

    if (!parsed.isJson) {
      return Response.json(
        {
          success: false,
          error:
            parsed.text ||
            `Server tidak mengembalikan JSON. HTTP ${res.status}`,
          debug,
        },
        { status: res.ok ? 502 : res.status }
      );
    }

    if (!res.ok) {
      const msg =
        data?.message ||
        data?.error ||
        data?.detail ||
        data?.data?.message ||
        data?.data?.error ||
        `Status check gagal. HTTP ${res.status}`;

      const betterMessage = String(msg).toLowerCase().includes("unknown api key")
        ? `Unknown API key dari ${providerConfig.provider}. Pastikan provider benar, API key tersalin lengkap, dan akun punya akses API untuk endpoint ini.`
        : msg;

      return Response.json(
        {
          success: false,
          error: betterMessage,
          raw: data,
          debug,
        },
        { status: res.status }
      );
    }

    const status = normalizeStatus(getStatus(data));
    const videoUrl = getVideoUrl(data);

    return Response.json({
      success: true,
      provider: providerConfig.provider,
      model,
      task_id: taskId,
      status,
      videoUrl,
      raw: data,
      debug,
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err?.message || "Status check error.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const taskId = body.taskId;
    const model = body.model || "kling-v3-motion-control-std";
    const provider = body.provider || "magnific";

    const url = new URL(req.url);
    url.searchParams.set("taskId", taskId || "");
    url.searchParams.set("model", model);
    url.searchParams.set("provider", provider);

    const headers = new Headers(req.headers);

    if (body.apiKey) {
      headers.set("x-user-api-key", body.apiKey);
    }

    const fakeReq = new Request(url.toString(), {
      method: "GET",
      headers,
    });

    return GET(fakeReq);
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err?.message || "Status check error.",
      },
      { status: 500 }
    );
  }
}
