import { supabase } from '../lib/supabaseClient';

export const getClientPlatform = () => 'admin_web';

export const legalService = {
  /**
   * Evaluates whether active legal documents exist and whether the caller has accepted them.
   * Fails closed: throws if RPC fails.
   */
  async getLegalAcceptanceStatus() {
    const { data, error } = await supabase.rpc('get_legal_acceptance_status');
    if (error) {
      console.error('[legalService] getLegalAcceptanceStatus error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Server-side proof that the user opened and viewed the document in full inside the app.
   */
  async recordLegalDocumentView(documentId) {
    const platform = getClientPlatform();
    const { error } = await supabase.rpc('record_legal_document_view', {
      _document_id: documentId,
      _client_platform: platform,
    });
    if (error) {
      console.error('[legalService] recordLegalDocumentView error:', error);
      throw error;
    }
  },

  /**
   * Records explicit acceptance of both active documents.
   * Requires proof of presentation (both documents viewed).
   */
  async acceptLegalDocuments(termsDocumentId, privacyDocumentId) {
    const platform = getClientPlatform();
    const userAgent = navigator.userAgent || 'JezSy-Admin-Dashboard';
    const { error } = await supabase.rpc('accept_legal_documents', {
      _terms_document_id: termsDocumentId,
      _privacy_document_id: privacyDocumentId,
      _client_platform: platform,
      _user_agent: userAgent,
    });
    if (error) {
      console.error('[legalService] acceptLegalDocuments error:', error);
      throw error;
    }
  },

  /**
   * Publish a new legal document version (Owner only).
   */
  async publishLegalDocument(type, version, title, markdownContent) {
    const { error } = await supabase.rpc('publish_legal_document_version', {
      _document_type: type,
      _version: version,
      _title: title,
      _content_markdown: markdownContent,
    });
    if (error) {
      console.error(`[legalService] publishLegalDocument error:`, error);
      throw error;
    }
  },

  /**
   * Check if the current user has permission to publish legal documents.
   */
  async canPublishLegalDocuments() {
    const { data, error } = await supabase.rpc('can_publish_legal_documents');
    if (error) {
      console.error(`[legalService] canPublishLegalDocuments error:`, error);
      throw error;
    }
    return data;
  },

  /**
   * Fetch all document history for admin.
   */
  async getDocumentHistory(type) {
    const { data, error } = await (supabase)
      .from('legal_documents')
      .select('*')
      .eq('document_type', type)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`[legalService] getDocumentHistory error:`, error);
      throw error;
    }
    return data;
  },
};
