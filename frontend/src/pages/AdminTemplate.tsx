import { Layout } from "../components/Layout";
import { NamedConfigManager } from "../components/NamedConfigManager";

export default function AdminTemplate() {
  return (
    <Layout>
      <h1 className="mb-5 text-xl font-semibold">SRS Template</h1>
      <NamedConfigManager
        endpoint="/admin/template"
        noun="Template"
        help="The active template describes the SRS sections the agent must follow; it is injected into the prompt as the required structure. Import a .md file, edit, and Save."
      />
    </Layout>
  );
}
