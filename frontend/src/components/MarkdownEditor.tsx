import MDEditor from "@uiw/react-md-editor";

export function MarkdownEditor({
  value,
  onChange,
  height = 460,
}: {
  value: string;
  onChange: (v: string) => void;
  height?: number;
}) {
  return (
    <div data-color-mode="light">
      <MDEditor value={value} onChange={(v) => onChange(v || "")} height={height} />
    </div>
  );
}
