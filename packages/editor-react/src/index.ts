// 現像の UI (ADR-0035)。ホストは <Editor host={...} /> で組み込む。react-router に依存しない
export { Editor } from "./EditorPage.tsx";
export {
  downloadName,
  type EditorDestination,
  type EditorHost,
  type EditorSendPayload,
  type EditorTelemetryEvent,
} from "./host.ts";
export type { EditorLocale } from "./i18n.ts";
