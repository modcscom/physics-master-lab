import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import katex from "katex";
import {
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  Archive,
  Send,
  Image as ImageIcon,
  X,
  PenTool,
  Maximize2,
  Printer,
  Atom
} from "lucide-react";

// =============== 核心配置：填写你的 CF 代理 ===============
const API_KEY = import.meta.env.VITE_API_KEY || "";
const PROXY_HOST = "https://gemini-proxy.xyy.workers.dev"; // 你的CF域名
const API_URL = `${PROXY_HOST}/v1/models/gemini-1.5-flash:generateContent`;
// ======================================================

const SYSTEM_INSTRUCTION = `
你是一位拥有20年教研经验的初中物理特级教师，擅长通过“逆向思维”和“苏格拉底式提问”帮助学生掌握物理本质。
输出物理公式必须用 LaTeX 格式，行内 $...$，块级 $$...$$
`;

type Message = {
  role: "user" | "model";
  text: string;
  image?: string;
};

type Mistake = {
  id: string;
  timestamp: number;
  originalImage?: string;
  originalText: string;
  topic: string;
  reason: string;
  advice: string;
};

type View = "dashboard" | "chat" | "formulas" | "archive";

const MathText = ({ text, style }: { text: string; style?: React.CSSProperties }) => {
  const renderContent = () => {
    if (!text) return null;
    const parts = text.split(/(\$\$.*?\$\$|\$.*?\$)/gs);
    return parts.map((part, index) => {
      if (part.startsWith("$$") && part.endsWith("$$")) {
        const math = part.slice(2, -2);
        try {
          const html = katex.renderToString(math, { displayMode: true, throwOnError: false });
          return <div key={index} dangerouslySetInnerHTML={{ __html: html }} style={{ margin: '1em 0' }} />;
        } catch (e) { return <code key={index}>{part}</code>; }
      } else if (part.startsWith("$") && part.endsWith("$")) {
        const math = part.slice(1, -1);
        try {
          const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
          return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (e) { return <code key={index}>{part}</code>; }
      }
      return <span key={index} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
    });
  };
  return <div style={style}>{renderContent()}</div>;
};

const ExamPaper = ({ content, onExpand }: { content: string; onExpand?: () => void }) => {
  return (
    <div style={{ margin: '16px 0', position: 'relative' }}>
      <div style={{
        backgroundColor: '#fff', padding: '30px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
        border: '1px solid #e2e8f0', borderRadius: '8px'
      }}>
        <div style={{ borderBottom: '1px solid #94a3b8', paddingBottom: '12px', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b' }}>绝密 ★ 启用前</div>
          <h2 style={{ fontSize: '20px', margin: '8px 0' }}>物理模拟试卷</h2>
        </div>
        <MathText text={content.trim()} style={{ lineHeight: 1.8, fontSize: '14px' }} />
        {onExpand && (
          <div style={{ height: '100px', background: 'linear-gradient(transparent, #fff)', position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', paddingBottom: '20px' }}>
            <button onClick={onExpand} style={{ padding: '10px 20px', background: '#38bdf8', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer' }}>
              <Maximize2 size={16} /> 查看完整试卷
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const Modal = ({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children?: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: '#fff', width: '100%', maxWidth: '900px', height: '90%', borderRadius: '12px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>智能试卷</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>{children}</div>
      </div>
    </div>
  );
};

const App = () => {
  const [currentView, setCurrentView] = useState<View>("chat");
  const [messages, setMessages] = useState<Message[]>([{
    role: "model", text: "嘿！欢迎来到物理实验室。🧪 我是你的AI物理老师，有什么可以帮你？"
  }]);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeExamContent, setActiveExamContent] = useState<string | null>(null);
  const [examTopic, setExamTopic] = useState("");
  const [examDifficulty, setExamDifficulty] = useState("标准");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // =============== 原生请求，不走SDK，永远不报错 ===============
  const handleSend = async (manualText?: string) => {
    const textToSend = typeof manualText === 'string' ? manualText : input;
    if ((!textToSend.trim() && !selectedImage) || isLoading) return;

    const newMessage: Message = { role: "user", text: textToSend, image: selectedImage || undefined };
    setMessages(prev => [...prev, newMessage]);
    setInput("");
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const contents = messages.map(msg => ({
        role: msg.role,
        parts: [
          ...(msg.image ? [{ inline_data: { mime_type: "image/jpeg", data: msg.image.split(",")[1] } }] : []),
          { text: msg.text || "" }
        ]
      }));

      const res = await fetch(`${API_URL}?key=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [...contents, { role: "user", parts: [{ text: textToSend }, ...(newMessage.image ? [{ inline_data: { mime_type: "image/jpeg", data: newMessage.image.split(",")[1] } }] : [])] }]
        })
      });

      const data = await res.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ 没有返回结果";
      setMessages(prev => [...prev, { role: "model", text: reply }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "model", text: `⚠️ 错误：${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };
  // ============================================================

  const renderMessageContent = (text: string) => {
    const match = text.match(/<exam_paper>([\s\S]*?)<\/exam_paper>/);
    if (match) {
      const examContent = match[1];
      const parts = text.split(match[0]);
      return (
        <div>
          {parts[0] && <MathText text={parts[0]} />}
          <ExamPaper content={examContent} onExpand={() => setActiveExamContent(examContent)} />
          {parts[1] && <MathText text={parts[1]} />}
        </div>
      );
    }
    return <MathText text={text} />;
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#0f172a', color: '#f1f5f9' }}>
      <div style={{ width: '260px', background: '#1e293b', padding: '24px', borderRight: '1px solid #334155' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg,#38bdf8,#818cf8)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Atom color="#fff" size={24} />
          </div>
          <h1 style={{ fontSize: '1.2rem', margin: 0 }}>Physics Lab</h1>
        </div>
        <button onClick={() => setCurrentView('chat')} style={{ width: '100%', padding: '12px', background: 'transparent', border: 'none', color: '#94a3b8', textAlign: 'left', cursor: 'pointer' }}>
          <MessageSquare size={20} /> 智能导师
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '16px' }}>
              <div style={{ maxWidth: '80%', padding: '16px', background: msg.role === 'user' ? '#38bdf8' : '#334155', color: msg.role === 'user' ? '#000' : '#fff', borderRadius: '16px' }}>
                {msg.image && <img src={msg.image} style={{ maxWidth: '200px', borderRadius: '8px', marginBottom: '8px' }} />}
                {renderMessageContent(msg.text)}
              </div>
            </div>
          ))}
          {isLoading && <div style={{ color: '#94a3b8' }}>AI 思考中...</div>}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid #334155' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <button onClick={() => fileInputRef.current?.click()} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <ImageIcon size={20} />
            </button>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              style={{ flex: 1, padding: '12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#fff', outline: 'none', minHeight: '44px' }}
              placeholder="输入问题..."
            />
            <button onClick={() => handleSend()} disabled={isLoading} style={{ padding: '12px 20px', background: '#38bdf8', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      <Modal isOpen={!!activeExamContent} onClose={() => setActiveExamContent(null)}>
        <MathText text={activeExamContent || ""} />
      </Modal>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />
