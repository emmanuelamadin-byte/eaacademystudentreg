"use client";

import { useState, useEffect } from "react";
import {
  Upload,
  Link2,
  Film,
  Check,
  LoaderCircle,
  RefreshCw,
  Search,
  AlertCircle,
  Clock,
  X,
  PlayCircle,
  ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api";
import { Upload as TusUpload } from "tus-js-client";

export interface BunnySelectedVideo {
  embedUrl: string;
  videoId: string;
  title?: string;
  duration?: string;
  durationFormatted?: string;
}

export interface BunnyStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVideo: (video: BunnySelectedVideo) => void;
  initialVideoTitle?: string;
  initialTitle?: string;
  currentVideoUrl?: string;
}

interface BunnyVideoItem {
  videoId: string;
  libraryId: string;
  title: string;
  status: number;
  statusLabel: string;
  isReady: boolean;
  lengthSeconds: number;
  durationFormatted: string;
  encodeProgress: number;
  embedUrl: string;
  dateUploaded?: string;
  views?: number;
  availableResolutions?: string;
}

export function BunnyStreamModal({
  isOpen,
  onClose,
  onSelectVideo,
  initialVideoTitle = "",
  initialTitle = "",
  currentVideoUrl = "",
}: BunnyStreamModalProps) {
  const [tab, setTab] = useState<"upload" | "fetch" | "library" | "status">("upload");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [libraryId, setLibraryId] = useState<string>("");

  const defaultTitle = initialTitle || initialVideoTitle || "";

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState(defaultTitle);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string>("");
  const [uploadSuccess, setUploadSuccess] = useState<string>("");

  // Fetch / Ingest state
  const [fetchUrl, setFetchUrl] = useState<string>("");
  const [fetchTitle, setFetchTitle] = useState<string>(defaultTitle);
  const [fetching, setFetching] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string>("");
  const [fetchSuccess, setFetchSuccess] = useState<string>("");

  // Library state
  const [libraryVideos, setLibraryVideos] = useState<BunnyVideoItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loadingLibrary, setLoadingLibrary] = useState<boolean>(false);
  const [libraryError, setLibraryError] = useState<string>("");

  // Current video status check
  const [statusVideoId, setStatusVideoId] = useState<string>("");
  const [videoStatus, setVideoStatus] = useState<BunnyVideoItem | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string>("");

  // Check Bunny configuration on mount
  useEffect(() => {
    if (!isOpen) return;
    api<{ configured: boolean; libraryId?: string }>("bunny.config")
      .then((res) => {
        setConfigured(res.configured);
        if (res.libraryId) setLibraryId(res.libraryId);
      })
      .catch(() => setConfigured(false));

    // If currentVideoUrl has a Bunny GUID, pre-populate status check
    const match = currentVideoUrl.match(/\/(?:embed|play)\/([a-zA-Z0-9]+)\/([a-zA-Z0-9_-]+)/i);
    if (match && match[2]) {
      setStatusVideoId(match[2]);
    }
  }, [isOpen, currentVideoUrl]);

  // Load library videos when switching to library tab
  useEffect(() => {
    if (tab === "library" && isOpen) {
      loadLibraryVideos();
    }
  }, [tab, isOpen]);

  async function loadLibraryVideos(query = searchQuery) {
    setLoadingLibrary(true);
    setLibraryError("");
    try {
      const res = await api<{ items: BunnyVideoItem[] }>("bunny.list", {
        search: query.trim() || undefined,
        perPage: 30,
      });
      setLibraryVideos(res.items || []);
    } catch (err: unknown) {
      setLibraryError(err instanceof Error ? err.message : "Could not load videos from Bunny library.");
    } finally {
      setLoadingLibrary(false);
    }
  }

  // Handle Direct Upload to Bunny Stream
  async function handleDirectUpload() {
    if (!uploadFile) {
      setUploadError("Please choose a video file to upload.");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setUploadError("");
    setUploadSuccess("");

    try {
      const title = uploadTitle.trim() || uploadFile.name.replace(/\.[^/.]+$/, "");
      // Step 1: Create video record on Bunny Stream
      const createRes = await api<{
        videoId: string;
        libraryId: string;
        embedUrl: string;
        directUpload: {
          uploadEndpoint: string;
          authorizationSignature: string;
          authorizationExpire: number;
        };
      }>("bunny.create", { title });

      const { videoId, embedUrl, directUpload } = createRes;

      // Step 2: Upload directly to Bunny Stream using its signed TUS protocol.
      // The upload signature is not an API key and must not be sent as AccessKey.
      await new Promise<void>((resolve, reject) => {
        const upload = new TusUpload(uploadFile, {
          endpoint: directUpload.uploadEndpoint,
          chunkSize: 10 * 1024 * 1024,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            AuthorizationSignature: directUpload.authorizationSignature,
            AuthorizationExpire: String(directUpload.authorizationExpire),
            VideoId: videoId,
            LibraryId: createRes.libraryId,
          },
          metadata: {
            filetype: uploadFile.type || "application/octet-stream",
            title,
          },
          onError: (error) => reject(error),
          onProgress: (bytesUploaded, bytesTotal) => {
            setUploadProgress(Math.round((bytesUploaded / bytesTotal) * 100));
          },
          onSuccess: () => resolve(),
        });

        upload.start();
      });

      setUploadSuccess(`Upload complete! Transcoding started on Bunny Stream.`);
      onSelectVideo({
        embedUrl,
        videoId,
        title,
        duration: "0:00",
        durationFormatted: "0:00",
      });
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload video to Bunny Stream.");
    } finally {
      setUploading(false);
    }
  }

  // Handle Ingest from Remote URL
  async function handleFetchFromUrl() {
    if (!fetchUrl.trim()) {
      setFetchError("Please enter a valid video link.");
      return;
    }
    setFetching(true);
    setFetchError("");
    setFetchSuccess("");

    try {
      const title = fetchTitle.trim() || "Imported Video";
      const res = await api<{
        success: boolean;
        videoId?: string;
        embedUrl: string;
      }>("bunny.fetch", {
        url: fetchUrl.trim(),
        title,
      });

      setFetchSuccess("Bunny Stream is downloading and transcoding the video!");
      if (res.embedUrl && res.videoId) {
        onSelectVideo({
          embedUrl: res.embedUrl,
          videoId: res.videoId,
          title,
          duration: "0:00",
          durationFormatted: "0:00",
        });
      }
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch video with Bunny Stream.");
    } finally {
      setFetching(false);
    }
  }

  // Check status of a video
  async function checkVideoStatus(id = statusVideoId) {
    if (!id.trim()) return;
    setCheckingStatus(true);
    setStatusError("");
    try {
      const res = await api<BunnyVideoItem>("bunny.status", { videoId: id.trim() });
      setVideoStatus(res);
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : "Could not retrieve status from Bunny.");
    } finally {
      setCheckingStatus(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !uploading) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          color: "#1e293b",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "680px",
          maxHeight: "90vh",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Film size={20} color="#38bdf8" />
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                Bunny Stream Video Hub
              </h3>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>
                Ultra-fast video hosting, signed secure streaming & auto-transcoding
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: uploading ? "not-allowed" : "pointer",
              padding: "4px",
              borderRadius: "6px",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Configuration Notice if missing */}
        {configured === false && (
          <div
            style={{
              padding: "0.85rem 1.25rem",
              backgroundColor: "#fef2f2",
              borderBottom: "1px solid #fee2e2",
              color: "#991b1b",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
            }}
          >
            <AlertCircle size={18} />
            <div>
              <strong>Bunny Stream is not configured yet.</strong> Add{" "}
              <code>BUNNY_STREAM_API_KEY</code> and <code>BUNNY_STREAM_LIBRARY_ID</code> to your{" "}
              <code>.env.local</code> to enable direct uploading and library syncing.
            </div>
          </div>
        )}

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #e2e8f0",
            backgroundColor: "#f8fafc",
            padding: "0 1rem",
            gap: "0.5rem",
          }}
        >
          <button
            type="button"
            onClick={() => setTab("upload")}
            style={{
              padding: "0.75rem 1rem",
              border: "none",
              background: "transparent",
              borderBottom: tab === "upload" ? "2px solid #0284c7" : "2px solid transparent",
              fontWeight: tab === "upload" ? 700 : 500,
              color: tab === "upload" ? "#0284c7" : "#64748b",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              fontSize: "0.875rem",
            }}
          >
            <Upload size={15} /> Direct Upload
          </button>
          <button
            type="button"
            onClick={() => setTab("fetch")}
            style={{
              padding: "0.75rem 1rem",
              border: "none",
              background: "transparent",
              borderBottom: tab === "fetch" ? "2px solid #0284c7" : "2px solid transparent",
              fontWeight: tab === "fetch" ? 700 : 500,
              color: tab === "fetch" ? "#0284c7" : "#64748b",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              fontSize: "0.875rem",
            }}
          >
            <Link2 size={15} /> Import from URL
          </button>
          <button
            type="button"
            onClick={() => setTab("library")}
            style={{
              padding: "0.75rem 1rem",
              border: "none",
              background: "transparent",
              borderBottom: tab === "library" ? "2px solid #0284c7" : "2px solid transparent",
              fontWeight: tab === "library" ? 700 : 500,
              color: tab === "library" ? "#0284c7" : "#64748b",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              fontSize: "0.875rem",
            }}
          >
            <Film size={15} /> Video Library
          </button>
          {statusVideoId && (
            <button
              type="button"
              onClick={() => {
                setTab("status");
                checkVideoStatus();
              }}
              style={{
                padding: "0.75rem 1rem",
                border: "none",
                background: "transparent",
                borderBottom: tab === "status" ? "2px solid #0284c7" : "2px solid transparent",
                fontWeight: tab === "status" ? 700 : 500,
                color: tab === "status" ? "#0284c7" : "#64748b",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                fontSize: "0.875rem",
              }}
            >
              <RefreshCw size={15} /> Check Status
            </button>
          )}
        </div>

        {/* Tab Body */}
        <div style={{ padding: "1.5rem", overflowY: "auto", flex: 1 }}>
          {/* TAB 1: DIRECT UPLOAD */}
          {tab === "upload" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div
                style={{
                  border: "2px dashed #cbd5e1",
                  borderRadius: "10px",
                  padding: "2rem 1.5rem",
                  textAlign: "center",
                  backgroundColor: uploadFile ? "#f0fdf4" : "#f8fafc",
                  borderColor: uploadFile ? "#86efac" : "#cbd5e1",
                  cursor: "pointer",
                }}
                onClick={() => {
                  const input = document.getElementById("bunny-file-input");
                  if (input) input.click();
                }}
              >
                <input
                  id="bunny-file-input"
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setUploadFile(file);
                      if (!uploadTitle.trim()) {
                        setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
                      }
                    }
                  }}
                />
                <Upload
                  size={32}
                  style={{
                    color: uploadFile ? "#16a34a" : "#64748b",
                    margin: "0 auto 0.75rem",
                  }}
                />
                {uploadFile ? (
                  <div>
                    <div style={{ fontWeight: 600, color: "#166534" }}>{uploadFile.name}</div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>
                      {(uploadFile.size / (1024 * 1024)).toFixed(1)} MB · Ready to upload directly to Bunny Stream
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 600, color: "#334155" }}>
                      Click to choose video file (MP4, MOV, WebM)
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px" }}>
                      Uploads directly from your browser to Bunny CDN storage
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                  Video Title
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Lesson 1: Introduction"
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.8rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              {/* Progress bar */}
              {uploading && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#0284c7",
                      marginBottom: "4px",
                    }}
                  >
                    <span>Uploading directly to Bunny CDN…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      width: "100%",
                      backgroundColor: "#e2e8f0",
                      borderRadius: "999px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${uploadProgress}%`,
                        backgroundColor: "#0284c7",
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                </div>
              )}

              {uploadError && (
                <div style={{ color: "#dc2626", fontSize: "0.85rem" }}>{uploadError}</div>
              )}
              {uploadSuccess && (
                <div style={{ color: "#16a34a", fontSize: "0.85rem", fontWeight: 600 }}>
                  ✓ {uploadSuccess}
                </div>
              )}

              <button
                type="button"
                onClick={handleDirectUpload}
                disabled={!uploadFile || uploading || configured === false}
                style={{
                  padding: "0.75rem",
                  backgroundColor: !uploadFile || uploading || configured === false ? "#94a3b8" : "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  cursor: !uploadFile || uploading || configured === false ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                {uploading ? (
                  <>
                    <LoaderCircle size={18} className="spin" /> Uploading to Bunny Stream ({uploadProgress}%)
                  </>
                ) : (
                  <>
                    <Upload size={18} /> Upload to Bunny Stream
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 2: FETCH / IMPORT FROM URL */}
          {tab === "fetch" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b", lineHeight: 1.5 }}>
                Bunny Stream can automatically download, transcode, and host videos from any public URL
                including Loom, Google Drive, YouTube, Vimeo, Dropbox, or direct HTTPS MP4 files.
              </p>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                  Source Video URL *
                </label>
                <input
                  type="url"
                  value={fetchUrl}
                  onChange={(e) => setFetchUrl(e.target.value)}
                  placeholder="https://www.loom.com/share/... or direct MP4 link"
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.8rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                  Video Title
                </label>
                <input
                  type="text"
                  value={fetchTitle}
                  onChange={(e) => setFetchTitle(e.target.value)}
                  placeholder="e.g. Masterclass Part 1"
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.8rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              {fetchError && (
                <div style={{ color: "#dc2626", fontSize: "0.85rem" }}>{fetchError}</div>
              )}
              {fetchSuccess && (
                <div style={{ color: "#16a34a", fontSize: "0.85rem", fontWeight: 600 }}>
                  ✓ {fetchSuccess}
                </div>
              )}

              <button
                type="button"
                onClick={handleFetchFromUrl}
                disabled={!fetchUrl.trim() || fetching || configured === false}
                style={{
                  padding: "0.75rem",
                  backgroundColor: !fetchUrl.trim() || fetching || configured === false ? "#94a3b8" : "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  cursor: !fetchUrl.trim() || fetching || configured === false ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                {fetching ? (
                  <>
                    <LoaderCircle size={18} className="spin" /> Sending to Bunny Stream…
                  </>
                ) : (
                  <>
                    <Link2 size={18} /> Ingest into Bunny Stream
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 3: BROWSE LIBRARY */}
          {tab === "library" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <Search
                    size={16}
                    style={{ position: "absolute", left: "10px", top: "11px", color: "#94a3b8" }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") loadLibraryVideos(searchQuery);
                    }}
                    placeholder="Search Bunny videos by title…"
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem 0.55rem 2rem",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => loadLibraryVideos(searchQuery)}
                  style={{
                    padding: "0.55rem 1rem",
                    backgroundColor: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  Search
                </button>
              </div>

              {libraryError && (
                <div style={{ color: "#dc2626", fontSize: "0.85rem" }}>{libraryError}</div>
              )}

              {loadingLibrary ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                  <LoaderCircle size={24} className="spin" style={{ margin: "0 auto 0.5rem" }} />
                  <div>Loading your Bunny Stream video library…</div>
                </div>
              ) : libraryVideos.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
                  No videos found in your Bunny library. Upload your first video above!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {libraryVideos.map((vid) => (
                    <div
                      key={vid.videoId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.75rem 1rem",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        backgroundColor: "#f8fafc",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1, paddingRight: "1rem" }}>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#1e293b" }}>
                          {vid.title}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            fontSize: "0.75rem",
                            color: "#64748b",
                            marginTop: "2px",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: vid.isReady ? "#dcfce7" : "#fef9c3",
                              color: vid.isReady ? "#166534" : "#854d0e",
                              fontWeight: 600,
                            }}
                          >
                            {vid.isReady ? "Ready" : "Transcoding…"}
                          </span>
                          {vid.durationFormatted && (
                            <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                              <Clock size={12} /> {vid.durationFormatted}
                            </span>
                          )}
                          <span>ID: {vid.videoId.slice(0, 8)}…</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectVideo({
                            embedUrl: vid.embedUrl,
                            videoId: vid.videoId,
                            title: vid.title,
                            duration: vid.durationFormatted,
                            durationFormatted: vid.durationFormatted,
                          });
                          onClose();
                        }}
                        style={{
                          padding: "0.45rem 0.85rem",
                          backgroundColor: "#0284c7",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "6px",
                          fontWeight: 600,
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Check size={14} /> Select
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CHECK STATUS */}
          {tab === "status" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  value={statusVideoId}
                  onChange={(e) => setStatusVideoId(e.target.value)}
                  placeholder="Enter Bunny Video GUID…"
                  style={{
                    flex: 1,
                    padding: "0.55rem 0.75rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                  }}
                />
                <button
                  type="button"
                  onClick={() => checkVideoStatus()}
                  disabled={checkingStatus || !statusVideoId.trim()}
                  style={{
                    padding: "0.55rem 1rem",
                    backgroundColor: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  {checkingStatus ? <LoaderCircle size={14} className="spin" /> : "Refresh"}
                </button>
              </div>

              {statusError && (
                <div style={{ color: "#dc2626", fontSize: "0.85rem" }}>{statusError}</div>
              )}

              {videoStatus && (
                <div
                  style={{
                    padding: "1rem",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#f8fafc",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    fontSize: "0.85rem",
                  }}
                >
                  <div>
                    <strong>Title:</strong> {videoStatus.title}
                  </div>
                  <div>
                    <strong>Status:</strong>{" "}
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "999px",
                        backgroundColor: videoStatus.isReady ? "#dcfce7" : "#fef9c3",
                        color: videoStatus.isReady ? "#166534" : "#854d0e",
                        fontWeight: 700,
                      }}
                    >
                      {videoStatus.statusLabel.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <strong>Encode Progress:</strong> {videoStatus.encodeProgress}%
                  </div>
                  <div>
                    <strong>Duration:</strong> {videoStatus.durationFormatted} ({videoStatus.lengthSeconds} seconds)
                  </div>
                  {videoStatus.availableResolutions && (
                    <div>
                      <strong>Resolutions:</strong> {videoStatus.availableResolutions}
                    </div>
                  )}
                  <div style={{ marginTop: "0.5rem" }}>
                    <a
                      href={videoStatus.embedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#0284c7",
                        textDecoration: "none",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      Open in Player <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
