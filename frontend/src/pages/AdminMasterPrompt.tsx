import { Layout } from "../components/Layout";
import { VersionedEditor } from "../components/VersionedEditor";

export default function AdminMasterPrompt() {
  return (
    <Layout>
      <h1 className="mb-5 text-xl font-semibold">Agent Master Prompt</h1>
      <VersionedEditor
        endpoint="/admin/master-prompt"
        title="Master prompt"
        help="This is used verbatim as the agent's system prompt. The code does not override it — only the JSON output contract is appended automatically."
      />
    </Layout>
  );
}
