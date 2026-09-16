import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, FileText, CheckCircle, AlertTriangle, LogOut, Loader2, ArrowDownCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { legalService } from '../services/legalService';
import MarkdownViewer from './MarkdownViewer';

const LegalAcceptanceGate = ({ status, error, onRetry, onAccepted }) => {
  const { signOut } = useAuth();
  
  const [activeDoc, setActiveDoc] = useState(null);
  const [termsViewed, setTermsViewed] = useState(status?.terms?.is_viewed || false);
  const [privacyViewed, setPrivacyViewed] = useState(status?.privacy?.is_viewed || false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const scrollRef = useRef(null);
  const [isRecordingView, setIsRecordingView] = useState(false);
  const recordedViewsRef = useRef({ terms: termsViewed, privacy: privacyViewed });

  // Update refs if props change
  useEffect(() => {
    if (status?.terms?.is_viewed) recordedViewsRef.current.terms = true;
    if (status?.privacy?.is_viewed) recordedViewsRef.current.privacy = true;
    setTermsViewed(status?.terms?.is_viewed || false);
    setPrivacyViewed(status?.privacy?.is_viewed || false);
  }, [status]);

  const handleRetry = async () => {
    setIsRetrying(true);
    await onRetry();
    setIsRetrying(false);
  };

  const handleAccept = async () => {
    if (!status?.terms?.document_id || !status?.privacy?.document_id) return;
    if (!termsAgreed || !privacyAgreed) return;

    setIsSubmitting(true);
    try {
      await legalService.acceptLegalDocuments(status.terms.document_id, status.privacy.document_id);
      onAccepted();
    } catch (err) {
      alert(err?.message || 'Could not record acceptance. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScroll = async (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // Within 20px of bottom
    if (scrollHeight - scrollTop - clientHeight < 20) {
      if (activeDoc && !recordedViewsRef.current[activeDoc]) {
        await recordView(activeDoc);
      }
    }
  };

  const recordView = async (docType) => {
    if (isRecordingView) return;
    
    const docId = docType === 'terms' ? status.terms.document_id : status.privacy.document_id;
    setIsRecordingView(true);
    try {
      await legalService.recordLegalDocumentView(docId);
      recordedViewsRef.current[docType] = true;
      if (docType === 'terms') setTermsViewed(true);
      if (docType === 'privacy') setPrivacyViewed(true);
    } catch (err) {
      console.error('Failed to record view', err);
    } finally {
      setIsRecordingView(false);
    }
  };

  // Fail-Closed Error State
  if (error || !status) {
    return (
      <div className="fixed inset-0 bg-gray-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8 text-center border border-gray-200">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <ShieldCheck className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Verification Error</h2>
          <p className="text-gray-600 mb-8">
            We could not securely verify your legal acceptance status. To protect your account and data, admin access remains blocked.
          </p>
          
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-black hover:bg-gray-800"
            >
              {isRetrying ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Retry Verification'}
            </button>
            <button
              onClick={() => signOut()}
              className="w-full flex items-center justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active Reader View
  if (activeDoc) {
    const docInfo = activeDoc === 'terms' ? status.terms : status.privacy;
    const hasViewed = activeDoc === 'terms' ? termsViewed : privacyViewed;

    return (
      <div className="fixed inset-0 bg-white z-[60] flex flex-col">
        <div className="flex-none border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-white shadow-sm">
          <div>
            <h2 className="text-xl font-bold">{docInfo.title}</h2>
            <span className="text-sm text-gray-500">Version {docInfo.version}</span>
          </div>
          <button 
            onClick={() => setActiveDoc(null)}
            className="text-gray-500 hover:text-gray-900 font-medium px-4 py-2"
          >
            Close Reader
          </button>
        </div>
        
        <div 
          className="flex-grow overflow-y-auto p-6 lg:p-12 prose prose-sm max-w-4xl mx-auto"
          onScroll={handleScroll}
          ref={scrollRef}
        >
          <MarkdownViewer content={docInfo.content_markdown} />
          
          <div className="mt-16 pt-8 border-t border-gray-200 flex justify-center pb-12">
            {hasViewed ? (
              <div className="flex items-center text-emerald-600 bg-emerald-50 px-4 py-2 rounded-full font-medium">
                <CheckCircle className="w-5 h-5 mr-2" />
                Document Reviewed
              </div>
            ) : (
              <div className="flex items-center text-amber-600 bg-amber-50 px-4 py-2 rounded-full">
                <ArrowDownCircle className="w-5 h-5 mr-2" />
                Scroll to the bottom to confirm review
              </div>
            )}
          </div>
        </div>
        
        <div className="flex-none border-t border-gray-200 p-4 bg-gray-50 flex justify-end">
          <button
            onClick={() => setActiveDoc(null)}
            className={`px-6 py-2.5 rounded-md font-medium text-white ${hasViewed ? 'bg-black hover:bg-gray-800' : 'bg-gray-300'}`}
          >
            {hasViewed ? 'Done Reading' : 'Scroll to Review'}
          </button>
        </div>
      </div>
    );
  }

  // Main Gate View
  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full my-8 flex flex-col overflow-hidden border border-gray-100">
        <div className="p-8 md:p-10 text-center">
          <div className="mx-auto w-16 h-16 bg-black rounded-full flex items-center justify-center mb-6">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-3">Updated Legal Agreements</h1>
          <p className="text-gray-600 text-lg max-w-lg mx-auto">
            Please review and accept our updated Terms of Service and Privacy Policy to continue managing the boutique.
          </p>
        </div>

        <div className="px-8 md:px-10 pb-6 space-y-4">
          {/* Terms Card */}
          <div className="border border-gray-200 rounded-lg p-5 flex items-center justify-between bg-white">
            <div className="flex-1">
              <h3 className="font-bold text-gray-900">{status.terms.title}</h3>
              <p className="text-sm text-gray-500 mt-1">Version {status.terms.version}</p>
            </div>
            <div className="flex items-center space-x-4">
              {termsViewed ? (
                <span className="flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                  <CheckCircle className="w-4 h-4 mr-1" /> Reviewed
                </span>
              ) : (
                <span className="flex items-center text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">
                  <AlertTriangle className="w-4 h-4 mr-1" /> Review Required
                </span>
              )}
              <button
                onClick={() => setActiveDoc('terms')}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 text-black flex items-center"
              >
                <FileText className="w-4 h-4 mr-2" />
                {termsViewed ? 'Read Again' : 'Read Terms'}
              </button>
            </div>
          </div>

          {/* Privacy Card */}
          <div className="border border-gray-200 rounded-lg p-5 flex items-center justify-between bg-white">
            <div className="flex-1">
              <h3 className="font-bold text-gray-900">{status.privacy.title}</h3>
              <p className="text-sm text-gray-500 mt-1">Version {status.privacy.version}</p>
            </div>
            <div className="flex items-center space-x-4">
              {privacyViewed ? (
                <span className="flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                  <CheckCircle className="w-4 h-4 mr-1" /> Reviewed
                </span>
              ) : (
                <span className="flex items-center text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">
                  <AlertTriangle className="w-4 h-4 mr-1" /> Review Required
                </span>
              )}
              <button
                onClick={() => setActiveDoc('privacy')}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 text-black flex items-center"
              >
                <FileText className="w-4 h-4 mr-2" />
                {privacyViewed ? 'Read Again' : 'Read Privacy'}
              </button>
            </div>
          </div>
        </div>

        <div className="px-8 md:px-10 py-6 bg-gray-50 border-t border-gray-200">
          <div className="space-y-4 mb-8">
            <label className={`flex items-start ${!termsViewed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={(e) => setTermsAgreed(e.target.checked)}
                  disabled={!termsViewed}
                  className="w-5 h-5 text-black border-gray-300 rounded focus:ring-black"
                />
              </div>
              <div className="ml-3 text-sm">
                <span className="font-medium text-gray-900">I have read and agree to the Terms of Service</span>
                {!termsViewed && <p className="text-gray-500">(You must read the Terms document in full first)</p>}
              </div>
            </label>

            <label className={`flex items-start ${!privacyViewed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  checked={privacyAgreed}
                  onChange={(e) => setPrivacyAgreed(e.target.checked)}
                  disabled={!privacyViewed}
                  className="w-5 h-5 text-black border-gray-300 rounded focus:ring-black"
                />
              </div>
              <div className="ml-3 text-sm">
                <span className="font-medium text-gray-900">I acknowledge that I have read the Privacy Policy</span>
                {!privacyViewed && <p className="text-gray-500">(You must read the Privacy document in full first)</p>}
              </div>
            </label>
          </div>

          <div className="flex flex-col space-y-3">
            <button
              onClick={handleAccept}
              disabled={!termsAgreed || !privacyAgreed || isSubmitting}
              className={`w-full flex items-center justify-center py-3.5 px-4 rounded-lg shadow-sm text-base font-bold text-white transition-colors
                ${termsAgreed && privacyAgreed ? 'bg-black hover:bg-gray-800' : 'bg-gray-300 cursor-not-allowed'}`}
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Accept & Continue to Dashboard'}
            </button>
            <button
              onClick={() => signOut()}
              className="w-full py-3 px-4 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegalAcceptanceGate;
