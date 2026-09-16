

const MarkdownViewer = ({ content }) => {
  if (!content) return null;

  const lines = content.split('\n');

  const renderInline = (text) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={index} className="font-bold text-gray-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="text-gray-800 text-sm leading-relaxed space-y-4">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={index} className="h-2" />;
        }

        // Horizontal Rule
        if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
          return <hr key={index} className="my-6 border-gray-200" />;
        }

        // Heading 1
        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={index} className="text-2xl font-bold mt-8 mb-4 text-gray-900">
              {trimmed.replace('# ', '')}
            </h1>
          );
        }

        // Heading 2
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={index} className="text-xl font-bold mt-6 mb-3 text-gray-900">
              {trimmed.replace('## ', '')}
            </h2>
          );
        }

        // Heading 3
        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={index} className="text-lg font-semibold mt-4 mb-2 text-gray-900">
              {trimmed.replace('### ', '')}
            </h3>
          );
        }

        // Blockquote
        if (trimmed.startsWith('> ')) {
          return (
            <blockquote
              key={index}
              className="border-l-4 border-black pl-4 py-2 my-4 bg-gray-50 italic text-gray-600"
            >
              {trimmed.replace('> ', '')}
            </blockquote>
          );
        }

        // Bullet list item
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const itemText = trimmed.slice(2);
          return (
            <div key={index} className="flex items-start mb-2 ml-4">
              <span className="text-black mr-3 text-lg leading-none">•</span>
              <span className="flex-1">{renderInline(itemText)}</span>
            </div>
          );
        }

        // Numbered list item
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={index} className="flex items-start mb-2 ml-4">
              <span className="text-black font-semibold mr-3 min-w-[20px]">
                {numMatch[1]}.
              </span>
              <span className="flex-1">{renderInline(numMatch[2])}</span>
            </div>
          );
        }

        // Default Paragraph
        return (
          <p key={index} className="mb-2">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
};

export default MarkdownViewer;
