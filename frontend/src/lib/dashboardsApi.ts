import axios from "axios";

// Ported from PROMAN/frontend/src/lib/api.ts — same axios client shape, adapted
// only to our auth and our backend base URL. The dashboard hooks/pages built
// against this keep the exact same call pattern (api.get<T>(url).then(r =>
// r.data.data)) as the original, approved code.
//
// Auth is httpOnly cookies (set by the backend on login/refresh) — the browser
// attaches them automatically via withCredentials, no Authorization header to
// build client-side.

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4100",
  timeout: 10000,
  withCredentials: true,
});

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message ?? "Request failed";
    return Promise.reject(new ApiError(msg, err?.response?.status));
  },
);

export default api;
