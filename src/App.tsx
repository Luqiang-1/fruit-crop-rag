import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Send, Loader2, Database, Trash2, Sprout } from 'lucide-react';
import Markdown from 'react-markdown';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Knowledge Base State
  const [kbStats, setKbStats] = useState({ chunkCount: 0, files: [] as string[] });
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchKbStats = async () => {
    try {
      const res = await fetch('/api/kb/stats');
      const data = await res.json();
      setKbStats(data);
    } catch (err) {
      console.error('Failed to fetch KB stats', err);
    }
  };

  useEffect(() => {
    fetchKbStats();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    
    setIsUploading(true);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        await fetchKbStats();
        // Clear input so same file can be uploaded again if needed
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        const errorData = await res.json();
        alert('上传失败: ' + errorData.error);
      }
    } catch (err) {
      console.error('Upload Error:', err);
      alert('网络错误，上传失败');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearKb = async () => {
    if (!confirm('确定要清空知识库吗？这将删除所有文档。')) return;
    try {
      await fetch('/api/kb/clear', { method: 'POST' });
      await fetchKbStats();
    } catch (err) {
      console.error('Clear KB Error:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    
    // Add an empty assistant message to stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });
      
      if (!res.ok) throw new Error('API request failed');
      if (!res.body) throw new Error('No response body');
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunkStr = decoder.decode(value, { stream: true });
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content += chunkStr;
            return newMessages;
          });
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].content = '对不起，系统繁忙或网络出现错误，请稍后再试。';
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900">
      {/* Sidebar / Knowledge Base Panel */}
      <aside className="w-80 border-r border-gray-200 bg-white flex flex-col shadow-sm flex-shrink-0 z-10 hidden md:flex">
        <div className="p-6 border-b border-gray-200 bg-green-50 flex items-center gap-3">
          <div className="bg-green-600 rounded p-2 text-white shadow-sm">
            <Sprout size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg text-green-900 leading-tight">果用经济作物</h1>
            <p className="text-xs text-green-700 font-medium">智能RAG问答平台</p>
          </div>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2 text-sm uppercase tracking-wider">
              <Database size={16} /> 本地知识库状态
            </h2>
            <button 
              onClick={handleClearKb} 
              className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-colors"
              title="清空知识库"
            >
              <Trash2 size={16} />
            </button>
          </div>
          
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 mb-6 text-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-500">已索引文本块:</span>
              <span className="font-mono font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">{kbStats.chunkCount} 个</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">收录文件数:</span>
              <span className="font-mono font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">{kbStats.files.length} 份</span>
            </div>
          </div>
          
          <div className="mb-6">
            <h3 className="font-medium text-sm text-gray-600 mb-3 ml-1">包含的文档:</h3>
            {kbStats.files.length === 0 ? (
              <div className="text-sm text-gray-400 bg-white border border-dashed rounded-lg p-8 text-center italic">
                暂无知识文档，请在下方上传。支持txt纯文本。
              </div>
            ) : (
              <ul className="space-y-2">
                {kbStats.files.map((file, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm bg-white border shadow-sm p-3 rounded-lg overflow-hidden shrink-0 text-gray-700 group hover:border-green-300 transition-colors">
                    <FileText size={16} className="text-green-500 shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="truncate" title={file}>{file}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        
        <div className="p-5 border-t border-gray-200 bg-gray-50">
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".txt" 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex items-center justify-center gap-2 bg-white border-2 border-green-500 text-green-700 hover:bg-green-50 font-medium py-3 px-4 rounded-xl shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            {isUploading ? '处理并向量化中...' : '上传TXT知识库文件'}
          </button>
          <p className="text-xs text-center text-gray-400 mt-3 flex flex-col gap-1">
            <span>支持种植方式、病虫害、农药使用等专业资料</span>
            <span>由于采用轻量级架构，只支持TXT格式</span>
          </p>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col bg-white overflow-hidden relative">
        <header className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white/80 backdrop-blur shrink-0 md:hidden">
            <h1 className="font-bold text-lg text-green-800 flex items-center gap-2">
               <Sprout size={20} className="text-green-600"/>
               果用经济作物问答
            </h1>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-20 px-4">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mb-6 shadow-sm rotate-3">
                  <Database size={32} className="text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-3 tracking-tight">你好！我是作物管理助手</h2>
                <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto leading-relaxed">
                  请先在左侧上传果树种植、防病虫等相关的知识库文件，然后向我提问。只有资料里有的内容我才会回答，绝不胡编乱造。
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg text-sm text-left">
                  {["柑橘锈壁虱用什么农药比较好？", "苹果树春季施肥要注意什么？", "葡萄白粉病如何防治？", "樱桃什么时候采摘酸甜度最佳？"].map(q => (
                    <button key={q} onClick={() => setInput(q)} 
                      className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl hover:bg-green-50 hover:border-green-200 transition-colors text-gray-600 font-medium">
                      "{q}"
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-10 h-10 rounded-full bg-green-100 border border-green-200 flex items-center justify-center shrink-0 shadow-sm mt-1">
                      <Sprout size={20} className="text-green-600" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-5 py-4 shadow-sm ${
                    msg.role === 'user' 
                    ? 'bg-green-600 text-white rounded-tr-sm selection:bg-green-400/30' 
                    : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm selection:bg-green-100'
                  }`}>
                    {msg.role === 'assistant' && msg.content === '' ? (
                      <div className="flex gap-1.5 items-center justify-center h-6 w-12">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{animationDelay: '0ms'}}></div>
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{animationDelay: '150ms'}}></div>
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{animationDelay: '300ms'}}></div>
                      </div>
                    ) : (
                      <div className="markdown-body text-sm md:text-base break-words leading-relaxed font-medium">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-white border-t border-gray-100">
          <div className="max-w-3xl mx-auto relative font-medium shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] rounded-2xl bg-white border border-gray-200 focus-within:border-green-400 focus-within:ring-4 focus-within:ring-green-50 transition-all">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="请输入您在种植、管理、销售方面的任何问题... (Enter 发送)"
              className="w-full bg-transparent border-0 rounded-2xl pl-5 pr-14 py-4 focus:ring-0 resize-none outline-none h-[58px] min-h-[58px] max-h-32 text-gray-700 placeholder-gray-400"
              rows={1}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !input.trim()}
              className="absolute right-2 bottom-2 p-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-0.5" />}
            </button>
          </div>
          <div className="text-center mt-3 text-[11px] text-gray-400 font-medium">
            基于本地知识库支持，严格防止幻觉产生。回答内容仅供参考。
          </div>
        </div>
      </main>
    </div>
  );
}

