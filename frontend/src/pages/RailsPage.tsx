import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, Network, ShieldCheck, Square, Trash2, Unplug } from "lucide-react";
import { api } from "../services/api";
import { keys, useApiMutation } from "../hooks/useApi";
import {
  EmptyState,
  PageHeading,
  Panel,
  QueryState,
  RouteLink,
  StatusBadge,
  TruthBadge,
  MutationFeedback,
} from "../components/ui";
import { SelectField, TextAreaField, TextField } from "../components/WorkspaceFields";
import { formText } from "../utils/forms";
export default function RailsPage() {
  const [recording, setRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<File | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [microphoneError, setMicrophoneError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
  }, [recordingUrl]);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const startRecording = async () => {
    setMicrophoneError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicrophoneError("This browser does not support microphone recording. Use file upload instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const preferredType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        preferredType ? { mimeType: preferredType } : undefined,
      );
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const extension = mimeType.includes("ogg")
          ? "ogg"
          : mimeType.includes("mp4")
            ? "m4a"
            : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size) {
          const file = new File([blob], `ramukaka-voice-${Date.now()}.${extension}`, {
            type: mimeType,
          });
          setRecordedAudio(file);
          setRecordingUrl(URL.createObjectURL(blob));
        }
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setMicrophoneError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow it in the browser or upload a voice note."
          : "The microphone could not start. Check the selected input device or upload a voice note.",
      );
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const clearRecording = () => {
    setRecordedAudio(null);
    setRecordingUrl(null);
    setMicrophoneError(null);
  };

  const query = useQuery({ queryKey: keys.rails, queryFn: api.rails });
  const contracts = useQuery({
    queryKey: keys.partnerContracts,
    queryFn: api.partnerContracts,
  });
  const gnani = useApiMutation(
    ({ audio, language }: { audio: File; language: string }) =>
      api.transcribeGnani("RK-2048", audio, language),
  );
  const pine = useApiMutation(
    (data: FormData) =>
      api.recordDocumentedResponse("RK-2048", {
        connector: "Pine Labs",
        operation: "create_payment_link",
        endpoint: formText(data, "endpoint"),
        documentation_url: formText(data, "documentation_url"),
        request: JSON.parse(formText(data, "request")) as Record<string, unknown>,
        response: JSON.parse(formText(data, "response")) as Record<string, unknown>,
      }),
  );
  const delhivery = useApiMutation(
    (data: FormData) =>
      api.recordDocumentedResponse("RK-2048", {
        connector: "Delhivery",
        operation: formText(data, "operation") as
          | "create_part_shipment"
          | "track_part_shipment",
        endpoint: formText(data, "endpoint"),
        documentation_url: formText(data, "documentation_url"),
        request: JSON.parse(formText(data, "request")) as Record<string, unknown>,
        response: JSON.parse(formText(data, "response")) as Record<string, unknown>,
      }),
  );
  return (
    <>
      <PageHeading
        eyebrow="THE BOUNDARY BETWEEN INTENT & ACTION"
        title="Rails & APIs"
        description="A working local API is not a live external integration. Here is where the boundary sits."
      />
      <div className="rail-boundary">
        <div>
          <span className="icon-tile">
            <Network size={22} />
          </span>
          <h2>Browser → local backend</h2>
          <p>Relative /api requests. Real local reads and writes.</p>
          <span className="tiny-label">IMPLEMENTED LOCAL INTERFACE</span>
        </div>
        <span className="boundary-arrow" aria-hidden="true">
          →
        </span>
        <div>
          <span className="icon-tile orange-icon">
            <Unplug size={22} />
          </span>
          <h2>Backend → mock connector</h2>
          <p>No payment network, booking service or outbound delivery.</p>
          <TruthBadge label="DOCUMENTATION_SIMULATION" />
        </div>
      </div>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        <div className="rail-grid">
          {query.data?.map((rail) => (
            <Panel key={rail.name}>
              <div className="record-heading">
                <h2>{rail.name}</h2>
                <StatusBadge status={rail.mode} />
              </div>
              <p className="muted my-4">{rail.description}</p>
              <TruthBadge label={rail.truth_label} />
              <div className="operation-list">
                {rail.operations.map((operation) => (
                  <code key={operation}>{operation}</code>
                ))}
              </div>
            </Panel>
          ))}
        </div>
        {query.data?.length === 0 && (
          <EmptyState title="No rails declared by the backend" />
        )}
      </QueryState>
      <QueryState
        pending={contracts.isPending}
        error={contracts.error}
        retry={() => void contracts.refetch()}
      >
        <Panel title="Competition rail contracts" className="mt-6">
          <div className="rail-grid">
            {contracts.data?.map((contract) => (
              <article key={contract.connector} className="disclosure">
                <div className="record-heading">
                  <h3>{contract.connector}</h3>
                  <StatusBadge status={contract.ready ? "ready" : "setup required"} />
                </div>
                <TruthBadge label={contract.truth_label} />
                <p className="small muted mt-3">
                  {contract.method} · <code>{contract.endpoint}</code>
                </p>
                <p className="small muted">{contract.blocker ?? contract.execution}</p>
                <a href={contract.documentation_url} target="_blank" rel="noreferrer">
                  Official documentation
                </a>
              </article>
            ))}
          </div>
        </Panel>
      </QueryState>
      <div className="detail-grid mt-6">
        <Panel title="1. Run Gnani STT live" kicker="REAL PARTNER CALL">
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const uploadedAudio = data.get("audio");
              const audio = recordedAudio ?? uploadedAudio;
              if (audio instanceof File && audio.size)
                gnani.mutate({
                  audio,
                  language: formText(data, "language_code"),
                });
              else setMicrophoneError("Record a voice note or choose an audio file first.");
            }}
          >
            <div>
              <span className="field-label">Record a voice note now</span>
              <div className="button-row mt-3">
                {!recording ? (
                  <button className="btn btn-secondary" type="button" onClick={() => void startRecording()}>
                    <Mic size={16} /> Record with microphone
                  </button>
                ) : (
                  <button className="btn btn-approval" type="button" onClick={stopRecording}>
                    <Square size={15} /> Stop recording
                  </button>
                )}
                {recordedAudio && !recording && (
                  <button className="btn btn-secondary" type="button" onClick={clearRecording}>
                    <Trash2 size={15} /> Discard recording
                  </button>
                )}
              </div>
              {recording && <p className="form-note mt-3">Recording… speak naturally, then press Stop recording.</p>}
              {recordingUrl && (
                <div className="voice-preview mt-3">
                  <audio controls src={recordingUrl} aria-label="Recorded voice note preview" />
                  <p className="form-note">Recorded locally. Review it, then send it to Gnani below.</p>
                </div>
              )}
              {microphoneError && <p className="error-text mt-3" role="alert">{microphoneError}</p>}
            </div>
            <TextField
              label="Or upload an existing voice note"
              name="audio"
              type="file"
              accept="audio/*"
              onChange={() => clearRecording()}
            />
            <SelectField label="Language" name="language_code" defaultValue="hi-IN">
              <option value="hi-IN">Hindi</option>
              <option value="en-IN">Indian English</option>
              <option value="kn-IN">Kannada</option>
              <option value="ta-IN">Tamil</option>
              <option value="te-IN">Telugu</option>
              <option value="mr-IN">Marathi</option>
            </SelectField>
            <p className="form-note">
              Microphone audio remains in the browser until you press Send. The backend then sends
              it to Gnani and logs its SHA-256 plus the exact raw response. Audio bytes and the API
              key are never written to the ledger.
            </p>
            <button className="btn btn-primary" disabled={gnani.isPending || recording}>
              {gnani.isPending ? "Calling Gnani…" : "Send voice note to Gnani"}
            </button>
            {gnani.isSuccess && gnani.data.status !== "live_succeeded" ? (
              <p className="error-text" role="alert">
                Gnani returned a failed live response. The failure was preserved in the connector
                ledger; inspect it before retrying.
              </p>
            ) : (
              <MutationFeedback
                mutation={gnani}
                success="Gnani transcription succeeded and was recorded in the connector ledger."
              />
            )}
          </form>
        </Panel>
        <Panel title="2. Record Pine Labs response" kicker="DOCUMENTATION SIMULATION">
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              pine.mutate(new FormData(event.currentTarget));
            }}
          >
            <TextField label="Endpoint" name="endpoint" readOnly defaultValue="https://pluraluat.v2.pinepg.in/api/pay/v1/paymentlink" />
            <TextField label="Official documentation" name="documentation_url" readOnly defaultValue="https://www.pinelabs.com/docs/online-payments/api/payment-links/create-payment-link" />
            <TextAreaField label="Request JSON" name="request" required rows={7} defaultValue={'{\n  "amount": {"value": 74900, "currency": "INR"},\n  "description": "RK-2048 filter replacement",\n  "merchant_payment_link_reference": "RK-2048"\n}'} />
            <TextAreaField label="Exact documented response JSON" name="response" required rows={7} defaultValue={'{\n  "payment_link": "https://shortener.v2.pinepg.in/PLUTUS/documentary",\n  "payment_link_id": "pl-documentary-RK-2048",\n  "status": "CREATED",\n  "amount": {"value": 74900, "currency": "INR"}\n}'} />
            <button className="btn btn-primary" disabled={pine.isPending}>Record Pine Labs response</button>
            <MutationFeedback mutation={pine} success="Exact Pine Labs documentation response recorded." />
          </form>
        </Panel>
      </div>
      <Panel title="3. Record Delhivery response" kicker="WIZARD USES PROVIDED DOCUMENTATION" className="mt-6">
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            delhivery.mutate(new FormData(event.currentTarget));
          }}
        >
          <SelectField label="Operation" name="operation" defaultValue="create_part_shipment">
            <option value="create_part_shipment">Create part shipment</option>
            <option value="track_part_shipment">Track part shipment</option>
          </SelectField>
          <TextField label="Exact Delhivery endpoint" name="endpoint" type="url" required placeholder="Paste from the competition documentation" />
          <TextField label="Official documentation URL" name="documentation_url" type="url" required defaultValue="https://help.delhivery.com/docs/client-developer-portal-1" />
          <TextAreaField label="Exact request JSON" name="request" required rows={6} placeholder="Paste the request matching the documentation" />
          <TextAreaField label="Exact documented response JSON" name="response" required rows={6} placeholder="Paste exactly what the documentation says Delhivery returns" />
          <p className="form-note">The backend rejects non-Delhivery domains and does not claim that a real shipment was created.</p>
          <button className="btn btn-primary" disabled={delhivery.isPending}>Record Delhivery response</button>
          <MutationFeedback mutation={delhivery} success="Exact Delhivery documentation response recorded." />
        </form>
      </Panel>
      <div className="detail-grid mt-6">
        <Panel title="Local API surface">
          <dl className="endpoint-list">
            <div>
              <dt>GET /api/cases/:id</dt>
              <dd>Case, timeline, approvals, evidence and decisions.</dd>
            </div>
            <div>
              <dt>POST /api/cases/:id/approvals</dt>
              <dd>
                Resolve an existing pending request. Never invent an amount.
              </dd>
            </div>
            <div>
              <dt>POST /api/cases/:id/actions</dt>
              <dd>
                Execute only an approved scope. The server guards every action.
              </dd>
            </div>
            <div>
              <dt>GET /api/connectors</dt>
              <dd>Inspect sanitized mock request / response traces.</dd>
            </div>
            <div>
              <dt>GET /api/system-prompt</dt>
              <dd>
                Read the prompt supplied by the backend, not a frontend copy.
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel title="What production would require">
          <ShieldCheck className="text-teal mb-4" size={28} />
          <TruthBadge label="PROPOSED_CAPABILITY" />
          <ul className="check-list mt-4">
            <li>
              Verified identities, authentication and household-level
              authorization.
            </li>
            <li>
              Contracted providers, explicit consent, operational support and
              dispute handling.
            </li>
            <li>
              Payment reconciliation, signed callbacks, retention policies and
              security review.
            </li>
          </ul>
          <RouteLink to="/evidence">
            Inspect actual local connector logs
          </RouteLink>
        </Panel>
      </div>
    </>
  );
}
