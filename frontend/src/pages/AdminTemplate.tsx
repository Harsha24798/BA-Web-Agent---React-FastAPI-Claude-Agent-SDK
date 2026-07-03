import { Layout } from "../components/Layout";
import { VersionedEditor } from "../components/VersionedEditor";

export default function AdminTemplate() {
  return (
    <Layout>
      <h1 className="mb-5 text-xl font-semibold">SRS Template</h1>
      <VersionedEditor
        endpoint="/admin/template"
        title="SRS document structure"
        help="This describes the SRS sections the agent must follow. It is injected into the prompt as the required structure."
      />
    </Layout>
  );
}
