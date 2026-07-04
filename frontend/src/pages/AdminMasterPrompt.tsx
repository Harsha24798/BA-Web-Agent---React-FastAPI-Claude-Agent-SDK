import { Layout } from "../components/Layout";
import { NamedConfigManager } from "../components/NamedConfigManager";

export default function AdminMasterPrompt() {
  return (
    <Layout>
      <h1 className="mb-5 text-xl font-semibold">Agent Master Prompt</h1>
      <NamedConfigManager
        endpoint="/admin/master-prompt"
        noun="Prompt"
        help="The active prompt is used verbatim as the agent's system prompt. The code does not override it — only the JSON output contract is appended automatically. Import a .md file, edit, and Save."
      />
    </Layout>
  );
}
