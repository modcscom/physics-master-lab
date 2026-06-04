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
  Download,
  Printer,
  Atom
} from "lucide-react";
import html2pdf from "html2pdf.js";
import { Document, Packer, Paragraph, TextRun } from "docx";

// --- 核心配置：完全走 Workers 反代，不再使用 window.fetch 拦截器 ---
const PROXY_URL = "https://gemini-proxy.xyy.workers.dev/v1beta/models/gemini-2.5-flash:generateContent";

// System Instruction
const SYSTEM_INSTRUCTION = `
# Role:
你是一位拥有20年教研经验的初中物理特级教师，擅长通过“逆向思维”和“苏格拉底式提问”帮助学生掌握物理本质。

# Core Objective:
针对学生上传的题目图片或知识点请求，提供：
1. 拍照批改：精准识别正误，定位思维盲区。
2. 智能讲解：不直接给答案，通过启发式对话引导学生推导。除非学生要求直接给出答案。
3. 知识点溯源：关联课本核心概念。
4. 公式渲染：使用标准的 LaTeX 格式输出所有物理公式，行内公式使用 $...$，块级公式使用 $$...$$。

# Workflow Modules:
## Module 3: 模拟考试卷生成
当学生要求“出题”或“组卷”时，将内容包裹在 <exam_paper>...</exam_paper> 中。试卷应包含卷头信息。
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

// ====================== 下载工具函数 ======================
const downloadPDF = (content: string, title = "物理试卷") => {
  const wrapper = document.createElement("div");
  wrapper.style.padding = "30px";
  wrapper.style.fontFamily = "SimSun, STSong, serif";
  wrapper.innerHTML = `
    <div style="text-align:center; margin-bottom:20px;">
      <div style="font-size:14px; font-weight:bold;">绝密 ★ 启用前</div>
      <h1>${title}</h1>
      <div>考试时长：45分钟　满分：100分</div>
    </div>
    <div style="line-height:2; font-size:16px;">${content.replace(/\$/g, "")}</div>
  `;
  html2pdf().from(wrapper).set({
    margin: 10,
    filename: `${title}.pdf`,
    image: { type: "jpeg", quality: 0.96 },
    html2canvas: { scale: 2 },
    jsPDF: { format: "a4", orientation: "portrait" }
  }).save();
};

const downloadDOCX = async (text: string, title = "物理试卷") => {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ children: [new TextRun({ text: title, size: 32, bold: true })] }),
        new Paragraph({ children: [new TextRun("")] }),
        ...text.split("\n").map(line => new Paragraph({
          children: [new TextRun(line.replace(/\$/g, ""))]
        }))
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.docx`;
  a.click();
  URL.revokeObjectURL(url);
};
// ==========================================================

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
        } catch (e) {
          return <code key={index}>{part}</code>;
        }
      } else if (part.startsWith("$") && part.endsWith("$")) {
        const math = part.slice(1, -1);
        try {
          const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
          return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (e) {
          return <code key={index}>{part}</code>;
        }
      }
      return <span key={index} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
    });
  };
  return <div style={style}>{renderContent()}</div>;
};

// --- 试卷预览（新增 下载PDF / 下载DOCX 按钮）---
const ExamPaper = ({ content, onExpand }: { content: string; onExpand?: () => void }) => {
  return (
    <div style={{ margin: '16px 0', position: 'relative' }}>
      <div style={{
        backgroundColor: '#fff', padding: '30px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
        border: '1px solid #e2e8f0', fontFamily: 'SimSun, STSong', color: '#1e293b', borderRadius: '8px',
        overflow: 'hidden', position: 'relative'
      }}>
        <div style={{ borderBottom: '1px solid #94a3b8', paddingBottom: '12px', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b' }}>绝密 ★ 启用前</div>
          <h2 style={{ fontSize: '20px', margin: '8px 0' }}>物理模拟试卷</h2>
        </div>
        <MathText text={content.trim()} style={{ lineHeight: 1.8, fontSize: '14px' }} />

        {onExpand && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '100px',
            background: 'linear-gradient(transparent, #fff)', display: 'flex', gap: '10px',
            alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '20px'
          }}>
            <button onClick={onExpand} style={{ padding: '10px 20px', background: '#38bdf8', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer' }}>
              <Maximize2 size={16} /> 查看完整
            </button>
            <button onClick={() => downloadPDF(content)} style={{ padding: '10px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer' }}>
              <Download size={16} /> PDF
            </button>
            <button onClick={() => downloadDOCX(content)} style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer' }}>
              <Download size={16} /> DOCX
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- 弹窗（新增下载按钮）---
const Modal = ({ isOpen, onClose, children, examContent }: { isOpen: boolean; onClose: () => void; children?: React.ReactNode; examContent?: string }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', width: '100%', maxWidth: '900px', height: '90%', borderRadius: '12px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>智能试卷</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            {examContent && (
              <>
                <button onClick={() => downloadPDF(examContent)} style={{ padding: '6px 12px', border: 'none', background: '#10b981', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>
                  <Download size={14} /> PDF
                </button>
                <button onClick={() => downloadDOCX(examContent)} style={{ padding: '6px 12px', border: 'none', background: '#2563eb', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>
                  <Download size={14} /> DOCX
                </button>
              </>
            )}
            <button onClick={onClose} style={{ padding: '6px 12px', border: 'none', background: '#f1f5f9', borderRadius: '6px', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>{children}</div>
      </div>
    </div>
  );
};

// --- Main App ---
const App = () => {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [messages, setMessages] = useState<Message[]>([
    { role: "model", text: "嘿！欢迎来到物理实验室。🧪 我是你的AI物理老师。不管是想攻克难题，还是需要我为你出一份模拟试卷，随时告诉我！" },
  ]);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeExamContent, setActiveExamContent] = useState<string | null>(null);
  const [examTopic, setExamTopic] = useState("");
  const [examDifficulty, setExamDifficulty] = useState("标准");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentView === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, currentView]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async (manualText?: string) => {
    const textToSend = typeof manualText === 'string' ? manualText : input;
    if ((!textToSend.trim() && !selectedImage) || isLoading) return;

    const newMessage: Message = { role: "user", text: textToSend, image: selectedImage || undefined };
    setMessages(prev => [...prev, newMessage]);
    if (!manualText) setInput("");
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const historyParts = messages.map(msg => {
        const parts: any[] = [];
        if (msg.image) {
          const base64Data = msg.image.split(",")[1];
          const mimeType = msg.image.split(";")[0].split(":")[1];
          parts.push({ inlineData: { mimeType, data: base64Data } });
        }
        if (msg.text) parts.push({ text: msg.text.replace(/<mistake_entry>[\s\S]*?<\/mistake_entry>/g, "") });
        return { role: msg.role, parts };
      });

      const currentParts: any[] = [];
      if (newMessage.image) {
        const base64Data = newMessage.image.split(",")[1];
        const mimeType = newMessage.image.split(";")[0].split(":")[1];
        currentParts.push({ inlineData: { mimeType, data: base64Data } });
      }
      if (newMessage.text) currentParts.push({ text: newMessage.text });

      const response = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [...historyParts, { role: 'user', parts: currentParts }],
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }
        })
      });

      if (!response.ok) throw new Error("请求失败");
      const resJson = await response.json();
      const responseText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "...";
      setMessages(prev => [...prev, { role: "model", text: responseText }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "model", text: `⚠️ 错误：${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessageContent = (text: string) => {
    const safeText = text.replace(/<mistake_entry>[\s\S]*?<\/mistake_entry>/g, "");
    const match = safeText.match(/<exam_paper>([\s\S]*?)<\/exam_paper>/);
    if (match) {
      const examContent = match[1];
      const parts = safeText.split(match[0]);
      return (
        <div>
          {parts[0] && <MathText text={parts[0]} />}
          <ExamPaper content={examContent} onExpand={() => setActiveExamContent(examContent)} />
          {parts[1] && <MathText text={parts[1]} />}
        </div>
      );
    }
    return <MathText text={safeText} />;
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#0f172a', color: '#f1f5f9' }}>
      <div style={{ width: '260px', background: '#1e293b', padding: '24px', borderRight: '1px solid #334155' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg,#38bdf8,#818cf8)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Atom color="#fff" size={24} />
          </div>
          <h1 style={{ fontSize: '1.2rem', margin: 0 }}>Physics Lab</h1>
        </div>
        <button onClick={() => setCurrentView('dashboard')} style={{ width: '100%', padding: '12px', background: 'transparent', border: 'none', color: currentView === 'dashboard' ? '#38bdf8' : '#94a3b8', textAlign: 'left', cursor: 'pointer' }}>
          <LayoutDashboard size={20} /> 控制台
        </button>
        <button onClick={() => setCurrentView('chat')} style={{ width: '100%', padding: '12px', background: 'transparent', border: 'none', color: currentView === 'chat' ? '#38bdf8' : '#94a3b8', textAlign: 'left', cursor: 'pointer' }}>
          <MessageSquare size={20} /> 智能导师
        </button>
        <button onClick={() => setCurrentView('formulas')} style={{ width: '100%', padding: '12px', background: 'transparent', border: 'none', color: currentView === 'formulas' ? '#38bdf8' : '#94a3b8', textAlign: 'left', cursor: 'pointer' }}>
          <BookOpen size={20} /> 公式库
        </button>
        <button onClick={() => setCurrentView('archive')} style={{ width: '100%', padding: '12px', background: 'transparent', border: 'none', color: currentView === 'archive' ? '#38bdf8' : '#94a3b8', textAlign: 'left', cursor: 'pointer' }}>
          <Archive size={20} /> 错题本
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Modal isOpen={!!activeExamContent} examContent={activeExamContent || undefined} onClose={() => setActiveExamContent(null)}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ fontWeight: 'bold' }}>绝密 ★ 启用前</div>
            <h1>2026年初中物理模拟试卷</h1>
            <div>考试时长：45分钟　满分：100分</div>
          </div>
          <MathText text={activeExamContent || ""} style={{ lineHeight: 2, fontSize: '16px' }} />
        </Modal>

        {currentView === 'dashboard' && (
          <div style={{ padding: '40px' }}>
            <h2>探索物理的奥秘</h2>
            <div style={{ padding: '32px', background: '#1e293b', borderRadius: '16px', marginTop: '20px' }}>
              <h3>智能组卷引擎</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>考点</label>
                  <input value={examTopic} onChange={(e) => setExamTopic(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }} placeholder="例如：力学" />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>难度</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['基础', '标准', '压轴'].map(l => (
                      <button key={l} onClick={() => setExamDifficulty(l)} style={{ flex: 1, padding: '10px', background: examDifficulty === l ? '#38bdf8' : '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={() => { setCurrentView('chat'); handleSend(`生成一份关于“${examTopic || '综合'}”难度【${examDifficulty}】的物理试卷`); }}
                style={{ width: '100%', padding: '14px', background: '#38bdf8', border: 'none', borderRadius: '10px', color: '#fff', marginTop: '20px', cursor: 'pointer' }}>
                生成试卷
              </button>
            </div>
          </div>
        )}

        {currentView === 'chat' && (
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
                <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                  style={{ flex: 1, padding: '12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#fff', outline: 'none', minHeight: '44px' }} placeholder="输入问题..." />
                <button onClick={() => handleSend()} disabled={isLoading} style={{ padding: '12px 20px', background: '#38bdf8', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {currentView === 'formulas' && <div style={{ padding: '40px' }}><h2>公式库</h2><p style={{ color: '#94a3b8' }}>建设中</p></div>}
        {currentView === 'archive' && <div style={{ padding: '40px' }}><h2>错题本</h2><p style={{ color: '#94a3b8' }}>建设中</p></div>}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
