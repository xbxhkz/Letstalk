import { ChatView } from "./ChatView";

export default async function ChatPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ChatView username={decodeURIComponent(username).toLowerCase()} />;
}
