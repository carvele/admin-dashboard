import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, FileText, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { legalService } from '../../services/legalService';
import MarkdownViewer from '../../components/MarkdownViewer';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function LegalManagement() {
  const [activeTab, setActiveTab] = useState('terms'); // 'terms' | 'privacy'
  const [history, setHistory] = useState([]);
  const [canPublish, setCanPublish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New draft state
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftData, setDraftData] = useState({
    title: '',
    version: '',
    content_markdown: '',
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [historyData, canPub] = await Promise.all([
        legalService.getDocumentHistory(activeTab),
        legalService.canPublishLegalDocuments(),
      ]);
      setHistory(historyData || []);
      setCanPublish(canPub);
    } catch (err) {
      setError(err.message || 'Failed to load legal documents');
      toast.error('Failed to load legal documents');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
    setIsDrafting(false);
  }, [activeTab, loadData]);

  const handleStartDraft = () => {
    const currentActive = history.find(doc => doc.is_active);
    const defaultTitle = activeTab === 'terms' ? 'Terms of Service' : 'Privacy Policy';
    const nextVersion = currentActive ? incrementVersion(currentActive.version) : '1.0.0';
    
    setDraftData({
      title: currentActive?.title || defaultTitle,
      version: nextVersion,
      content_markdown: currentActive?.content_markdown || '',
    });
    setIsDrafting(true);
  };

  const incrementVersion = (ver) => {
    // Basic semver bump of the minor version for suggestions
    const match = ver.match(/^v?(\d+)\.(\d+)(\.(\d+))?$/);
    if (match) {
      return `${match[1]}.${parseInt(match[2], 10) + 1}.0`;
    }
    return `${ver}-new`;
  };

  const handlePublish = (e) => {
    e.preventDefault();
    if (!draftData.version.trim() || !draftData.title.trim() || !draftData.content_markdown.trim()) {
      toast.error('All fields are required');
      return;
    }
    setShowPublishConfirm(true);
  };

  const confirmPublish = async () => {
    if (isPublishing) return;

    setIsPublishing(true);
    try {
      await legalService.publishLegalDocument(
        activeTab,
        draftData.version,
        draftData.title,
        draftData.content_markdown
      );
      toast.success(`Successfully published new ${activeTab === 'terms' ? 'Terms' : 'Privacy'} version!`);
      setIsDrafting(false);
      setShowPublishConfirm(false);
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to publish document');
    } finally {
      setIsPublishing(false);
    }
  };

  if (loading && history.length === 0) {
    return <div className="p-8 text-gray-500 flex items-center"><Loader2 className="animate-spin mr-2" /> Loading legal documents...</div>;
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Legal Document Management</h1>
          <p className="text-gray-500 text-sm">
            Publish and track Terms of Service and Privacy Policy versions. 
            Publishing a new version will immediately gate customer mobile app sessions.
          </p>
        </div>
        {canPublish && !isDrafting && (
          <button
            onClick={handleStartDraft}
            className="btn-primary flex items-center"
          >
            <Plus size={16} className="mr-2" /> Publish New Version
          </button>
        )}
      </div>

      {!canPublish && (
        <div className="mb-6 p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded text-sm">
          <strong>Restricted Access:</strong> Only the boutique Owner can publish new legal documents.
        </div>
      )}

      {error && (
        <div className="p-4 mb-6 bg-red-100 border border-red-300 text-red-800 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('terms')}
          className={`py-3 px-6 font-semibold border-b-2 ${
            activeTab === 'terms'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          Terms of Service
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('privacy')}
          className={`py-3 px-6 font-semibold border-b-2 ${
            activeTab === 'privacy'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          Privacy Policy
        </button>
      </div>

      {isDrafting ? (
        <form onSubmit={handlePublish} className="card p-6 bg-white border rounded shadow-sm">
          <div className="flex justify-between items-center mb-4 pb-4 border-b">
            <h2 className="text-lg font-bold">Drafting New Version ({activeTab})</h2>
            <button
              type="button"
              onClick={() => setIsDrafting(false)}
              className="text-sm text-gray-500 hover:text-gray-800"
              disabled={isPublishing}
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="draft-title" className="label">Document Title</label>
              <input
                id="draft-title"
                type="text"
                className="input w-full"
                value={draftData.title}
                onChange={e => setDraftData(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <label htmlFor="draft-version" className="label">Version String</label>
              <input
                id="draft-version"
                type="text"
                className="input w-full"
                value={draftData.version}
                onChange={e => setDraftData(prev => ({ ...prev, version: e.target.value }))}
                placeholder="e.g. 1.0.0"
                required
              />
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="draft-content" className="label">Markdown Content</label>
            <div className="grid grid-cols-2 gap-4 h-96">
              <textarea
                id="draft-content"
                className="input w-full h-full font-mono text-sm resize-none"
                value={draftData.content_markdown}
                onChange={e => setDraftData(prev => ({ ...prev, content_markdown: e.target.value }))}
                placeholder="# Terms of Service..."
                required
              />
              <div className="border border-gray-300 rounded p-4 h-full overflow-y-auto bg-gray-50">
                <MarkdownViewer content={draftData.content_markdown || '*Preview will appear here*'} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setIsDrafting(false)}
              className="btn-outline"
              disabled={isPublishing}
            >
              Discard Draft
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isPublishing}
            >
              {isPublishing ? (
                <><Loader2 size={16} className="animate-spin mr-2 inline" /> Publishing...</>
              ) : (
                'Publish Immediately for Customers'
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-bold mb-2">Version History</h2>
          {history.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-gray-300 rounded-lg text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No documents published yet.</p>
              <p className="text-sm mt-1">Publish a version to enforce the customer legal gate.</p>
            </div>
          ) : (
            history.map((doc) => (
              <div
                key={doc.id}
                className={`border rounded-lg p-5 ${
                  doc.is_active ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-gray-900 text-lg">{doc.title}</h3>
                      <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-sm border font-medium">
                        v{doc.version}
                      </span>
                      {doc.is_active && (
                        <span className="flex items-center text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-sm font-semibold border border-emerald-200">
                          <CheckCircle className="w-4 h-4 mr-1" /> Active
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      Published {new Date(doc.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 font-mono text-right">
                    ID: {doc.id.split('-')[0]}...<br/>
                    SHA: {doc.content_sha256.substring(0, 8)}...
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 max-h-48 overflow-y-auto bg-gray-50/50 p-3 rounded text-sm border">
                  <MarkdownViewer content={doc.content_markdown} />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={showPublishConfirm}
        title={`Publish ${activeTab === 'terms' ? 'Terms of Service' : 'Privacy Policy'} v${draftData.version}`}
        message={`Are you sure you want to publish version ${draftData.version}?`}
        confirmText="Publish Document"
        cancelText="Cancel"
        isDestructive={true}
        severity="HIGH"
        consequences={[
          'All active customer mobile app sessions will be gated until explicitly reviewing and accepting the updated version.',
          'The Admin Dashboard remains available for authorized staff with no legal acceptance gate.',
        ]}
        isLoading={isPublishing}
        onConfirm={confirmPublish}
        onCancel={() => {
          if (!isPublishing) setShowPublishConfirm(false);
        }}
      />
    </div>
  );
}
