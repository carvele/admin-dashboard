export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          created_at: string
          id: string
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string | null
        }
        Relationships: []
      }
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_dismissals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          title: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_assets: {
        Row: {
          created_at: string | null
          id: string
          model_url: string | null
          product_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          model_url?: string | null
          product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          model_url?: string | null
          product_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ar_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_sessions: {
        Row: {
          created_at: string | null
          duration: number | null
          id: string
          product_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          duration?: number | null
          id?: string
          product_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          duration?: number | null
          id?: string
          product_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ar_sessions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      capsule_items: {
        Row: {
          capsule_id: string
          created_at: string | null
          wardrobe_item_id: string
        }
        Insert: {
          capsule_id: string
          created_at?: string | null
          wardrobe_item_id: string
        }
        Update: {
          capsule_id?: string
          created_at?: string | null
          wardrobe_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capsule_items_capsule_id_fkey"
            columns: ["capsule_id"]
            isOneToOne: false
            referencedRelation: "capsules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capsule_items_wardrobe_item_id_fkey"
            columns: ["wardrobe_item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["id"]
          },
        ]
      }
      capsules: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          target_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          target_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          target_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capsules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          id: string
          image_url: string | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      color_list: {
        Row: {
          created_at: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      color_options: {
        Row: {
          border: string | null
          hex: string
          name: string
          sort_order: number | null
        }
        Insert: {
          border?: string | null
          hex: string
          name: string
          sort_order?: number | null
        }
        Update: {
          border?: string | null
          hex?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      connections: {
        Row: {
          action_user_id: string
          created_at: string | null
          id: string
          status: string
          updated_at: string | null
          user_id_1: string
          user_id_2: string
        }
        Insert: {
          action_user_id: string
          created_at?: string | null
          id?: string
          status: string
          updated_at?: string | null
          user_id_1: string
          user_id_2: string
        }
        Update: {
          action_user_id?: string
          created_at?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          user_id_1?: string
          user_id_2?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_action_user_id_fkey"
            columns: ["action_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_user_id_1_fkey"
            columns: ["user_id_1"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_user_id_2_fkey"
            columns: ["user_id_2"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          customer_id: string | null
          id: string
          last_message: string | null
          last_message_id: string | null
          last_message_time: string | null
          unread_customer: number
          unread_staff: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          last_message?: string | null
          last_message_id?: string | null
          last_message_time?: string | null
          unread_customer?: number
          unread_staff?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          last_message?: string | null
          last_message_id?: string | null
          last_message_time?: string | null
          unread_customer?: number
          unread_staff?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_last_message_id_fkey"
            columns: ["last_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string | null
          failed_attempts: number | null
          fingerprint: string
          id: string
          last_seen: string | null
          lockout_until: string | null
          login_history: Json | null
          name: string | null
          session_id: string | null
          staff_email: string | null
          staff_name: string | null
          status: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          failed_attempts?: number | null
          fingerprint: string
          id?: string
          last_seen?: string | null
          lockout_until?: string | null
          login_history?: Json | null
          name?: string | null
          session_id?: string | null
          staff_email?: string | null
          staff_name?: string | null
          status?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          failed_attempts?: number | null
          fingerprint?: string
          id?: string
          last_seen?: string | null
          lockout_until?: string | null
          login_history?: Json | null
          name?: string | null
          session_id?: string | null
          staff_email?: string | null
          staff_name?: string | null
          status?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_chat_participants: {
        Row: {
          chat_id: string
          created_at: string | null
          user_id: string
        }
        Insert: {
          chat_id: string
          created_at?: string | null
          user_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_chat_participants_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "direct_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_chat_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_chats: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          chat_id: string | null
          content: string
          created_at: string | null
          id: string
          read_at: string | null
          sender_id: string | null
        }
        Insert: {
          chat_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          read_at?: string | null
          sender_id?: string | null
        }
        Update: {
          chat_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          read_at?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "direct_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string | null
          id: string
          rating: number | null
          text: string | null
          updated_at: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          rating?: number | null
          text?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          rating?: number | null
          text?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          adjusted_score: number | null
          available: number | null
          cascade_deleted_at: string | null
          category: string | null
          color: string
          created_at: string | null
          deleted: boolean | null
          deleted_at: string | null
          demand_score: number | null
          demand_scored_at: string | null
          hex_color: string | null
          id: string
          item: string | null
          pattern: string
          product_doc_id: string | null
          reserved: number | null
          size: string | null
          sku: string | null
          stock_tier: string | null
          total: number | null
          updated_at: string | null
          variant_sku: string | null
        }
        Insert: {
          adjusted_score?: number | null
          available?: number | null
          cascade_deleted_at?: string | null
          category?: string | null
          color?: string
          created_at?: string | null
          deleted?: boolean | null
          deleted_at?: string | null
          demand_score?: number | null
          demand_scored_at?: string | null
          hex_color?: string | null
          id?: string
          item?: string | null
          pattern?: string
          product_doc_id?: string | null
          reserved?: number | null
          size?: string | null
          sku?: string | null
          stock_tier?: string | null
          total?: number | null
          updated_at?: string | null
          variant_sku?: string | null
        }
        Update: {
          adjusted_score?: number | null
          available?: number | null
          cascade_deleted_at?: string | null
          category?: string | null
          color?: string
          created_at?: string | null
          deleted?: boolean | null
          deleted_at?: string | null
          demand_score?: number | null
          demand_scored_at?: string | null
          hex_color?: string | null
          id?: string
          item?: string | null
          pattern?: string
          product_doc_id?: string | null
          reserved?: number | null
          size?: string | null
          sku?: string | null
          stock_tier?: string | null
          total?: number | null
          updated_at?: string | null
          variant_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_doc_id_fkey"
            columns: ["product_doc_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          action: string | null
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
          timestamp: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          timestamp?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          timestamp?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          context_label: string | null
          context_ref: string | null
          context_type: string | null
          conversation_id: string
          created_at: string | null
          delivered_at: string | null
          edited_at: string | null
          id: string
          image_url: string | null
          is_auto_response: boolean | null
          reactions: Json
          read_at: string | null
          sender_id: string | null
          sender_name: string | null
          sender_role: string | null
          sender_type: string | null
          text: string | null
        }
        Insert: {
          context_label?: string | null
          context_ref?: string | null
          context_type?: string | null
          conversation_id: string
          created_at?: string | null
          delivered_at?: string | null
          edited_at?: string | null
          id?: string
          image_url?: string | null
          is_auto_response?: boolean | null
          reactions?: Json
          read_at?: string | null
          sender_id?: string | null
          sender_name?: string | null
          sender_role?: string | null
          sender_type?: string | null
          text?: string | null
        }
        Update: {
          context_label?: string | null
          context_ref?: string | null
          context_type?: string | null
          conversation_id?: string
          created_at?: string | null
          delivered_at?: string | null
          edited_at?: string | null
          id?: string
          image_url?: string | null
          is_auto_response?: boolean | null
          reactions?: Json
          read_at?: string | null
          sender_id?: string | null
          sender_name?: string | null
          sender_role?: string | null
          sender_type?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json | null
          id: string
          is_read: boolean | null
          push_expired_at: string | null
          pushed_at: string | null
          title: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          push_expired_at?: string | null
          pushed_at?: string | null
          title: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          push_expired_at?: string | null
          pushed_at?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outfit_items: {
        Row: {
          color_tags: string[] | null
          created_at: string
          id: string
          image_url: string | null
          name: string | null
          outfit_id: string
          owned: boolean
          product_id: string | null
          slot: string | null
        }
        Insert: {
          color_tags?: string[] | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string | null
          outfit_id: string
          owned?: boolean
          product_id?: string | null
          slot?: string | null
        }
        Update: {
          color_tags?: string[] | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string | null
          outfit_id?: string
          owned?: boolean
          product_id?: string | null
          slot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outfit_items_outfit_id_fkey"
            columns: ["outfit_id"]
            isOneToOne: false
            referencedRelation: "saved_outfits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outfit_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pattern_list: {
        Row: {
          created_at: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_centavos: number
          attempt_started_at: string
          created_at: string
          currency: string
          id: string
          last_event: Json | null
          last_event_id: string | null
          method: string | null
          provider: string
          provider_payment_id: string | null
          provider_payment_intent_id: string | null
          provider_ref: string | null
          purpose: string
          refund_required_at: string | null
          requires_refund: boolean
          reservation_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_centavos: number
          attempt_started_at?: string
          created_at?: string
          currency?: string
          id?: string
          last_event?: Json | null
          last_event_id?: string | null
          method?: string | null
          provider?: string
          provider_payment_id?: string | null
          provider_payment_intent_id?: string | null
          provider_ref?: string | null
          purpose?: string
          refund_required_at?: string | null
          requires_refund?: boolean
          reservation_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_centavos?: number
          attempt_started_at?: string
          created_at?: string
          currency?: string
          id?: string
          last_event?: Json | null
          last_event_id?: string | null
          method?: string | null
          provider?: string
          provider_payment_id?: string | null
          provider_payment_intent_id?: string | null
          provider_ref?: string | null
          purpose?: string
          refund_required_at?: string | null
          requires_refund?: boolean
          reservation_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pose_guide_products: {
        Row: {
          created_at: string | null
          id: string
          pose_guide_id: string
          product_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          pose_guide_id: string
          product_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          pose_guide_id?: string
          product_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pose_guide_products_pose_guide_id_fkey"
            columns: ["pose_guide_id"]
            isOneToOne: false
            referencedRelation: "pose_guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pose_guide_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pose_guides: {
        Row: {
          base_pose_type: string | null
          category: string
          created_at: string | null
          deleted: boolean | null
          description: string | null
          difficulty: string | null
          id: string
          image_storage_path: string | null
          image_url: string | null
          is_featured: boolean | null
          name: string
          occasion: string | null
          sort_order: number | null
          style_tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          base_pose_type?: string | null
          category: string
          created_at?: string | null
          deleted?: boolean | null
          description?: string | null
          difficulty?: string | null
          id: string
          image_storage_path?: string | null
          image_url?: string | null
          is_featured?: boolean | null
          name: string
          occasion?: string | null
          sort_order?: number | null
          style_tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          base_pose_type?: string | null
          category?: string
          created_at?: string | null
          deleted?: boolean | null
          description?: string | null
          difficulty?: string | null
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          is_featured?: boolean | null
          name?: string
          occasion?: string | null
          sort_order?: number | null
          style_tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      processed_payment_webhook_events: {
        Row: {
          event_id: string
          next_status: string
          payment_id: string
          processed_at: string
        }
        Insert: {
          event_id: string
          next_status: string
          payment_id: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          next_status?: string
          payment_id?: string
          processed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processed_payment_webhook_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      product_complements: {
        Row: {
          complementary_product_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          origin: string
          product_id: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          complementary_product_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          origin?: string
          product_id: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          complementary_product_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          origin?: string
          product_id?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_complements_complementary_product_id_fkey"
            columns: ["complementary_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_complements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          ar_data: Json
          base_color: string | null
          care_instructions: string | null
          category: string | null
          category_id: string | null
          color: string | null
          created_at: string
          created_by: string | null
          dateadded: string | null
          deleted: boolean | null
          deleted_at: string | null
          description: string | null
          discount_percentage: number | null
          fit_and_sizing: string | null
          garment_metadata: Json | null
          id: string
          image_url: string | null
          images: string[] | null
          is_alterable: boolean | null
          is_featured: boolean | null
          is_new_arrival: boolean | null
          mask_url: string | null
          material: string | null
          measurements: Json | null
          model_3d_url: string | null
          name: string
          occasion: string | null
          on_sale: boolean | null
          pattern: string | null
          price: number | null
          rating: number | null
          review_count: number | null
          sale_price: number | null
          season: string | null
          sizes: string[] | null
          status: string | null
          stock: number | null
          stockbaseline: number | null
          style_code: string | null
          sub_category: string | null
          tags: string[] | null
          updated_at: string
          updated_by: string | null
          visibility: string | null
        }
        Insert: {
          ar_data?: Json
          base_color?: string | null
          care_instructions?: string | null
          category?: string | null
          category_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          dateadded?: string | null
          deleted?: boolean | null
          deleted_at?: string | null
          description?: string | null
          discount_percentage?: number | null
          fit_and_sizing?: string | null
          garment_metadata?: Json | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_alterable?: boolean | null
          is_featured?: boolean | null
          is_new_arrival?: boolean | null
          mask_url?: string | null
          material?: string | null
          measurements?: Json | null
          model_3d_url?: string | null
          name: string
          occasion?: string | null
          on_sale?: boolean | null
          pattern?: string | null
          price?: number | null
          rating?: number | null
          review_count?: number | null
          sale_price?: number | null
          season?: string | null
          sizes?: string[] | null
          status?: string | null
          stock?: number | null
          stockbaseline?: number | null
          style_code?: string | null
          sub_category?: string | null
          tags?: string[] | null
          updated_at?: string
          updated_by?: string | null
          visibility?: string | null
        }
        Update: {
          ar_data?: Json
          base_color?: string | null
          care_instructions?: string | null
          category?: string | null
          category_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          dateadded?: string | null
          deleted?: boolean | null
          deleted_at?: string | null
          description?: string | null
          discount_percentage?: number | null
          fit_and_sizing?: string | null
          garment_metadata?: Json | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_alterable?: boolean | null
          is_featured?: boolean | null
          is_new_arrival?: boolean | null
          mask_url?: string | null
          material?: string | null
          measurements?: Json | null
          model_3d_url?: string | null
          name?: string
          occasion?: string | null
          on_sale?: boolean | null
          pattern?: string | null
          price?: number | null
          rating?: number | null
          review_count?: number | null
          sale_price?: number | null
          season?: string | null
          sizes?: string[] | null
          status?: string | null
          stock?: number | null
          stockbaseline?: number | null
          style_code?: string | null
          sub_category?: string | null
          tags?: string[] | null
          updated_at?: string
          updated_by?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_line: string | null
          barangay: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          deleted: boolean | null
          email: string | null
          employment_status: string | null
          expo_push_token: string | null
          first_name: string | null
          fit_preference: string | null
          full_name: string | null
          gender: string | null
          id: string
          is_blocked: boolean | null
          is_wardrobe_shared: boolean | null
          last_name: string | null
          outfit_privacy: string
          phone: string | null
          profile_visibility: string
          province: string | null
          role: string
          updated_at: string
          username: string | null
          wardrobe_privacy: string | null
          wishlist_privacy: string | null
          zip_code: string | null
        }
        Insert: {
          address_line?: string | null
          barangay?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted?: boolean | null
          email?: string | null
          employment_status?: string | null
          expo_push_token?: string | null
          first_name?: string | null
          fit_preference?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          is_blocked?: boolean | null
          is_wardrobe_shared?: boolean | null
          last_name?: string | null
          outfit_privacy?: string
          phone?: string | null
          profile_visibility?: string
          province?: string | null
          role?: string
          updated_at?: string
          username?: string | null
          wardrobe_privacy?: string | null
          wishlist_privacy?: string | null
          zip_code?: string | null
        }
        Update: {
          address_line?: string | null
          barangay?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted?: boolean | null
          email?: string | null
          employment_status?: string | null
          expo_push_token?: string | null
          first_name?: string | null
          fit_preference?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          is_blocked?: boolean | null
          is_wardrobe_shared?: boolean | null
          last_name?: string | null
          outfit_privacy?: string
          phone?: string | null
          profile_visibility?: string
          province?: string | null
          role?: string
          updated_at?: string
          username?: string | null
          wardrobe_privacy?: string | null
          wishlist_privacy?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          key: string
          request_count: number
          window_start: string
        }
        Insert: {
          key: string
          request_count?: number
          window_start: string
        }
        Update: {
          key?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      reservation_items: {
        Row: {
          color: string | null
          created_at: string
          id: string
          image_url: string | null
          inventory_id: string | null
          product_id: string | null
          product_name: string | null
          quantity: number
          reservation_id: string
          size: string | null
          unit_price: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          inventory_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          reservation_id: string
          size?: string | null
          unit_price?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          inventory_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          reservation_id?: string
          size?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservation_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_items_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          appointment_time: string | null
          assigned_staff_id: string | null
          balance_method: string | null
          balance_settled_at: string | null
          balance_settled_by: string | null
          balance_settled_by_name: string | null
          balance_settled_method: string | null
          cancellation_reason: string | null
          color: string | null
          confirmed_at: string | null
          confirmed_by_id: string | null
          confirmed_by_name: string | null
          countdown: boolean | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          date: string | null
          deleted: boolean | null
          deposit: number | null
          display_id: string | null
          hidden_in_cancelled: boolean | null
          hidden_in_history: boolean | null
          id: string
          idempotency_key: string | null
          image_url: string | null
          payment_due_at: string | null
          payment_method: string | null
          payment_reminder_sent_at: string | null
          payment_status: string | null
          payment_type: string | null
          pickup_token: string | null
          product_id: string | null
          product_name: string | null
          purchase_mode: string
          quantity: number | null
          receipt_url: string | null
          rental_price: number | null
          reschedule_requested_at: string | null
          reschedule_requested_at_time: string | null
          reschedule_requested_date: string | null
          return_date: string | null
          sales_channel: string
          size: string | null
          staff_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          appointment_time?: string | null
          assigned_staff_id?: string | null
          balance_method?: string | null
          balance_settled_at?: string | null
          balance_settled_by?: string | null
          balance_settled_by_name?: string | null
          balance_settled_method?: string | null
          cancellation_reason?: string | null
          color?: string | null
          confirmed_at?: string | null
          confirmed_by_id?: string | null
          confirmed_by_name?: string | null
          countdown?: boolean | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          date?: string | null
          deleted?: boolean | null
          deposit?: number | null
          display_id?: string | null
          hidden_in_cancelled?: boolean | null
          hidden_in_history?: boolean | null
          id?: string
          idempotency_key?: string | null
          image_url?: string | null
          payment_due_at?: string | null
          payment_method?: string | null
          payment_reminder_sent_at?: string | null
          payment_status?: string | null
          payment_type?: string | null
          pickup_token?: string | null
          product_id?: string | null
          product_name?: string | null
          purchase_mode?: string
          quantity?: number | null
          receipt_url?: string | null
          rental_price?: number | null
          reschedule_requested_at?: string | null
          reschedule_requested_at_time?: string | null
          reschedule_requested_date?: string | null
          return_date?: string | null
          sales_channel?: string
          size?: string | null
          staff_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          appointment_time?: string | null
          assigned_staff_id?: string | null
          balance_method?: string | null
          balance_settled_at?: string | null
          balance_settled_by?: string | null
          balance_settled_by_name?: string | null
          balance_settled_method?: string | null
          cancellation_reason?: string | null
          color?: string | null
          confirmed_at?: string | null
          confirmed_by_id?: string | null
          confirmed_by_name?: string | null
          countdown?: boolean | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          date?: string | null
          deleted?: boolean | null
          deposit?: number | null
          display_id?: string | null
          hidden_in_cancelled?: boolean | null
          hidden_in_history?: boolean | null
          id?: string
          idempotency_key?: string | null
          image_url?: string | null
          payment_due_at?: string | null
          payment_method?: string | null
          payment_reminder_sent_at?: string | null
          payment_status?: string | null
          payment_type?: string | null
          pickup_token?: string | null
          product_id?: string | null
          product_name?: string | null
          purchase_mode?: string
          quantity?: number | null
          receipt_url?: string | null
          rental_price?: number | null
          reschedule_requested_at?: string | null
          reschedule_requested_at_time?: string | null
          reschedule_requested_date?: string | null
          return_date?: string | null
          sales_channel?: string
          size?: string | null
          staff_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_confirmed_by_id_fkey"
            columns: ["confirmed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_votes: {
        Row: {
          created_at: string
          id: string
          review_id: string
          updated_at: string
          user_id: string
          vote_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          updated_at?: string
          user_id: string
          vote_type: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          updated_at?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          admin_reply: string | null
          comment: string | null
          created_at: string
          dislikes: number | null
          id: string
          images: string[] | null
          is_pinned: boolean | null
          likes: number | null
          product_id: string
          rating: number
          reviewer_name: string | null
          updated_at: string | null
          user_id: string
          verified_purchase: boolean
        }
        Insert: {
          admin_reply?: string | null
          comment?: string | null
          created_at?: string
          dislikes?: number | null
          id?: string
          images?: string[] | null
          is_pinned?: boolean | null
          likes?: number | null
          product_id: string
          rating: number
          reviewer_name?: string | null
          updated_at?: string | null
          user_id: string
          verified_purchase?: boolean
        }
        Update: {
          admin_reply?: string | null
          comment?: string | null
          created_at?: string
          dislikes?: number | null
          id?: string
          images?: string[] | null
          is_pinned?: boolean | null
          likes?: number | null
          product_id?: string
          rating?: number
          reviewer_name?: string | null
          updated_at?: string | null
          user_id?: string
          verified_purchase?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_outfits: {
        Row: {
          created_at: string
          deleted: boolean | null
          id: string
          items: Json | null
          name: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted?: boolean | null
          id?: string
          items?: Json | null
          name?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted?: boolean | null
          id?: string
          items?: Json | null
          name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_outfits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      staff_status_history: {
        Row: {
          change_type: string
          changed_by: string
          created_at: string
          effective_date: string
          id: string
          new_value: string
          note: string | null
          previous_value: string | null
          staff_id: string
        }
        Insert: {
          change_type: string
          changed_by: string
          created_at?: string
          effective_date?: string
          id?: string
          new_value: string
          note?: string | null
          previous_value?: string | null
          staff_id: string
        }
        Update: {
          change_type?: string
          changed_by?: string
          created_at?: string
          effective_date?: string
          id?: string
          new_value?: string
          note?: string | null
          previous_value?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_status_history_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          change_type: string
          created_at: string
          delta: number
          id: string
          inventory_id: string | null
          new_stock: number
          note: string | null
          previous_stock: number
          product_id: string
          updated_at: string
        }
        Insert: {
          change_type: string
          created_at?: string
          delta: number
          id?: string
          inventory_id?: string | null
          new_stock: number
          note?: string | null
          previous_stock: number
          product_id: string
          updated_at?: string
        }
        Update: {
          change_type?: string
          created_at?: string
          delta?: number
          id?: string
          inventory_id?: string | null
          new_stock?: number
          note?: string | null
          previous_stock?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_notify_requests: {
        Row: {
          created_at: string
          id: string
          product_id: string
          size: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          size: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          size?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_notify_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_notify_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      store_closures: {
        Row: {
          closure_date: string
          custom_close_time: string | null
          custom_open_time: string | null
          is_fully_closed: boolean | null
          reason: string | null
        }
        Insert: {
          closure_date: string
          custom_close_time?: string | null
          custom_open_time?: string | null
          is_fully_closed?: boolean | null
          reason?: string | null
        }
        Update: {
          closure_date?: string
          custom_close_time?: string | null
          custom_open_time?: string | null
          is_fully_closed?: boolean | null
          reason?: string | null
        }
        Relationships: []
      }
      store_hours: {
        Row: {
          close_time: string
          day_of_week: number
          is_closed: boolean | null
          max_daily_bookings: number | null
          open_time: string
          slot_capacity: number
        }
        Insert: {
          close_time: string
          day_of_week: number
          is_closed?: boolean | null
          max_daily_bookings?: number | null
          open_time: string
          slot_capacity?: number
        }
        Update: {
          close_time?: string
          day_of_week?: number
          is_closed?: boolean | null
          max_daily_bookings?: number | null
          open_time?: string
          slot_capacity?: number
        }
        Relationships: []
      }
      suggested_outfits: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          items: Json | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          items?: Json | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          items?: Json | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_color_profiles: {
        Row: {
          avoided_colors: string[]
          created_at: string
          personalization_consented_at: string | null
          preferred_colors: string[]
          undertone: string
          undertone_confidence: number
          undertone_source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avoided_colors?: string[]
          created_at?: string
          personalization_consented_at?: string | null
          preferred_colors?: string[]
          undertone?: string
          undertone_confidence?: number
          undertone_source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avoided_colors?: string[]
          created_at?: string
          personalization_consented_at?: string | null
          preferred_colors?: string[]
          undertone?: string
          undertone_confidence?: number
          undertone_source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_measurements: {
        Row: {
          created_at: string
          height: number | null
          id: string
          measurement_source: string | null
          measurements: Json | null
          per_field_confidence: Json | null
          scan_confidence: number | null
          scanned_at: string | null
          user_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          measurement_source?: string | null
          measurements?: Json | null
          per_field_confidence?: Json | null
          scan_confidence?: number | null
          scanned_at?: string | null
          user_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          measurement_source?: string | null
          measurements?: Json | null
          per_field_confidence?: Json | null
          scan_confidence?: number | null
          scanned_at?: string | null
          user_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_measurements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_streaks: {
        Row: {
          created_at: string | null
          current_streak: number | null
          last_action_date: string | null
          longest_streak: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_streak?: number | null
          last_action_date?: string | null
          longest_streak?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_streak?: number | null
          last_action_date?: string | null
          longest_streak?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wardrobe_items: {
        Row: {
          category: string | null
          color_tags: string[] | null
          created_at: string
          deleted: boolean | null
          garment_type: string | null
          id: string
          image_url: string | null
          last_worn_at: string | null
          product_id: string | null
          sub_category: string | null
          user_id: string | null
          wear_count: number
        }
        Insert: {
          category?: string | null
          color_tags?: string[] | null
          created_at?: string
          deleted?: boolean | null
          garment_type?: string | null
          id?: string
          image_url?: string | null
          last_worn_at?: string | null
          product_id?: string | null
          sub_category?: string | null
          user_id?: string | null
          wear_count?: number
        }
        Update: {
          category?: string | null
          color_tags?: string[] | null
          created_at?: string
          deleted?: boolean | null
          garment_type?: string | null
          id?: string
          image_url?: string | null
          last_worn_at?: string | null
          product_id?: string | null
          sub_category?: string | null
          user_id?: string | null
          wear_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "wardrobe_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wardrobe_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_inventory_on_hand: {
        Args: { p_delta: number; p_inventory_id: string; p_reason: string }
        Returns: Json
      }
      admin_manage_device: {
        Args: {
          _action: string
          _fingerprint: string
          _user_id: string
          _value?: string
        }
        Returns: undefined
      }
      admin_prune_devices: { Args: { _cutoff: string }; Returns: number }
      assert_bookable_slot: {
        Args: {
          _appointment: string
          _check_capacity?: boolean
          _date: string
          _exclude_reservation?: string
        }
        Returns: undefined
      }
      can_manage_customers: { Args: never; Returns: boolean }
      can_manage_inventory: { Args: never; Returns: boolean }
      can_manage_staff: { Args: never; Returns: boolean }
      can_operate_inventory: { Args: never; Returns: boolean }
      cancel_reservation_as_manager: {
        Args: {
          _expected_status: string
          _reason?: string
          _reservation_id: string
        }
        Returns: Json
      }
      check_rate_limit: {
        Args: {
          p_key: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      complete_reservation_handover: {
        Args: { _method?: string; _reservation_id: string }
        Returns: Json
      }
      create_reservation: {
        Args: {
          _appointment_time: string
          _color: string
          _date: string
          _payment_option?: string
          _product_id: string
          _quantity: number
          _receipt_path: string
          _size: string
        }
        Returns: Json
      }
      create_reservation_multi: {
        Args: {
          _appointment_time: string
          _customer_id?: string
          _date: string
          _items: Json
          _payment_option?: string
          _receipt_path?: string
        }
        Returns: Json
      }
      create_reservation_multi_idempotent: {
        Args: {
          _appointment_time: string
          _customer_id?: string
          _date: string
          _idempotency_key: string
          _items: Json
          _payment_option?: string
          _receipt_path?: string
        }
        Returns: Json
      }
      dispatch_pending_push: { Args: never; Returns: number }
      expire_all_stale_reservations: { Args: never; Returns: number }
      expire_stale_payments: { Args: never; Returns: number }
      get_direct_chat_summaries: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          chat_id: string
          other_user_id: string
          updated_at: string
        }[]
      }
      get_most_wishlisted_products: {
        Args: never
        Returns: {
          image_url: string
          product_id: string
          product_name: string
          wishlist_count: number
        }[]
      }
      get_or_create_direct_chat: {
        Args: { other_user_id: string }
        Returns: string
      }
      get_outfit_privacy: { Args: { p_user_id: string }; Returns: string }
      get_pose_guides_for_product: {
        Args: { p_product_id: string }
        Returns: {
          category: string
          id: string
          image_url: string
          name: string
          occasion: string
        }[]
      }
      get_product_loved_by: {
        Args: { p_product_id: string }
        Returns: {
          public_users: Json
          total_count: number
        }[]
      }
      get_public_outfits_for_product: {
        Args: { p_product_id: string }
        Returns: {
          created_at: string
          outfit_id: string
          outfit_name: string
          user_id: string
        }[]
      }
      get_public_profiles: {
        Args: { p_user_ids: string[] }
        Returns: {
          first_name: string
          id: string
          last_name: string
          username: string
          wardrobe_privacy: string
        }[]
      }
      get_review_stats: { Args: { p_product_id: string }; Returns: Json }
      get_reviews_with_user_vote: {
        Args: { p_limit?: number; p_offset?: number; p_product_id: string }
        Returns: {
          review: Database["public"]["Tables"]["reviews"]["Row"]
          user_vote: string
        }[]
      }
      get_slot_booked_counts: {
        Args: { _date: string }
        Returns: {
          booked_count: number
          slot_time: string
        }[]
      }
      get_suggested_connections: {
        Args: never
        Returns: {
          first_name: string
          id: string
          last_name: string
          mutual_count: number
          username: string
        }[]
      }
      get_trending_products: {
        Args: { limit_count?: number }
        Returns: {
          ar_data: Json
          base_color: string | null
          care_instructions: string | null
          category: string | null
          category_id: string | null
          color: string | null
          created_at: string
          created_by: string | null
          dateadded: string | null
          deleted: boolean | null
          deleted_at: string | null
          description: string | null
          discount_percentage: number | null
          fit_and_sizing: string | null
          garment_metadata: Json | null
          id: string
          image_url: string | null
          images: string[] | null
          is_alterable: boolean | null
          is_featured: boolean | null
          is_new_arrival: boolean | null
          mask_url: string | null
          material: string | null
          measurements: Json | null
          model_3d_url: string | null
          name: string
          occasion: string | null
          on_sale: boolean | null
          pattern: string | null
          price: number | null
          rating: number | null
          review_count: number | null
          sale_price: number | null
          season: string | null
          sizes: string[] | null
          status: string | null
          stock: number | null
          stockbaseline: number | null
          style_code: string | null
          sub_category: string | null
          tags: string[] | null
          updated_at: string
          updated_by: string | null
          visibility: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_wardrobe_privacy: { Args: { p_user_id: string }; Returns: string }
      get_wishlist_privacy: { Args: { p_user_id: string }; Returns: string }
      increment_wear_count: {
        Args: { p_item_id: string }
        Returns: {
          category: string | null
          color_tags: string[] | null
          created_at: string
          deleted: boolean | null
          garment_type: string | null
          id: string
          image_url: string | null
          last_worn_at: string | null
          product_id: string | null
          sub_category: string | null
          user_id: string | null
          wear_count: number
        }
        SetofOptions: {
          from: "*"
          to: "wardrobe_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin_or_owner: { Args: never; Returns: boolean }
      is_awaiting_payment_status: {
        Args: { _status: string }
        Returns: boolean
      }
      is_blocked_between: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: boolean
      }
      is_chat_participant: {
        Args: { p_chat_id: string; p_user_id: string }
        Returns: boolean
      }
      is_device_approved: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_staff_or_admin: { Args: never; Returns: boolean }
      mark_direct_message_read: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      mark_support_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_support_messages_delivered: {
        Args: { p_conversation_id?: string; p_message_ids?: string[] }
        Returns: undefined
      }
      merge_message_reaction: {
        Args: { p_emoji: string; p_message_id: string }
        Returns: Json
      }
      process_account_deletion: { Args: { _request_id: string }; Returns: Json }
      promote_product_complement_suggestion: {
        Args: {
          p_complementary_product_id: string
          p_origin: string
          p_product_id: string
          p_sort_order?: number
        }
        Returns: {
          out_complementary_product_id: string
          out_id: string
          out_product_id: string
          out_sort_order: number
        }[]
      }
      recalculate_inventory_stock: { Args: never; Returns: Json }
      record_boutique_sale: {
        Args: {
          p_idempotency_key: string
          p_inventory_id: string
          p_payment_method: string
          p_quantity: number
          p_unit_price: number
        }
        Returns: Json
      }
      record_reservation_balance: {
        Args: { _method?: string; _reservation_id: string }
        Returns: Json
      }
      register_device: {
        Args: { _fingerprint: string; _user_agent?: string }
        Returns: {
          created_at: string | null
          failed_attempts: number | null
          fingerprint: string
          id: string
          last_seen: string | null
          lockout_until: string | null
          login_history: Json | null
          name: string | null
          session_id: string | null
          staff_email: string | null
          staff_name: string | null
          status: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_account_deletion_request: {
        Args: { _request_id: string }
        Returns: Json
      }
      request_account_deletion: { Args: { _reason?: string }; Returns: string }
      request_reschedule: {
        Args: {
          _appointment_time: string
          _date: string
          _reservation_id: string
        }
        Returns: Json
      }
      reservation_holds_stock: {
        Args: { _deleted: boolean; _status: string }
        Returns: boolean
      }
      resolve_reschedule: {
        Args: { _approve: boolean; _reservation_id: string }
        Returns: Json
      }
      resolve_reschedule_as_manager: {
        Args: { _approve: boolean; _reservation_id: string }
        Returns: Json
      }
      resolve_username: { Args: { p_username: string }; Returns: string }
      review_reservation_receipt: {
        Args: { _approve: boolean; _reservation_id: string }
        Returns: Json
      }
      save_pose_guide: {
        Args: {
          p_base_pose_type?: string
          p_category: string
          p_description?: string
          p_difficulty?: string
          p_id: string
          p_image_storage_path?: string
          p_image_url?: string
          p_is_featured?: boolean
          p_name: string
          p_occasion?: string
          p_product_ids?: string[]
          p_sort_order?: number
          p_style_tags?: string[]
        }
        Returns: undefined
      }
      search_catalog: {
        Args: {
          ar_only?: boolean
          category_ids?: string[]
          color_filters?: string[]
          fit_filters?: string[]
          material_filters?: string[]
          max_price?: number
          min_price?: number
          new_arrivals_only?: boolean
          on_sale_only?: boolean
          search_query?: string
          size_filters?: string[]
          sort_by?: string
          tag_filters?: string[]
        }
        Returns: {
          ar_data: Json
          base_color: string | null
          care_instructions: string | null
          category: string | null
          category_id: string | null
          color: string | null
          created_at: string
          created_by: string | null
          dateadded: string | null
          deleted: boolean | null
          deleted_at: string | null
          description: string | null
          discount_percentage: number | null
          fit_and_sizing: string | null
          garment_metadata: Json | null
          id: string
          image_url: string | null
          images: string[] | null
          is_alterable: boolean | null
          is_featured: boolean | null
          is_new_arrival: boolean | null
          mask_url: string | null
          material: string | null
          measurements: Json | null
          model_3d_url: string | null
          name: string
          occasion: string | null
          on_sale: boolean | null
          pattern: string | null
          price: number | null
          rating: number | null
          review_count: number | null
          sale_price: number | null
          season: string | null
          sizes: string[] | null
          status: string | null
          stock: number | null
          stockbaseline: number | null
          style_code: string | null
          sub_category: string | null
          tags: string[] | null
          updated_at: string
          updated_by: string | null
          visibility: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_public_profiles: {
        Args: { p_exclude_id: string; p_query: string }
        Returns: {
          first_name: string
          id: string
          last_name: string
          username: string
        }[]
      }
      send_customer_notification: {
        Args: { _body: string; _title: string; _user_id: string }
        Returns: string
      }
      send_payment_deadline_reminders: { Args: never; Returns: number }
      set_customer_archive_state: {
        Args: {
          change_reason: string
          new_deleted: boolean
          target_customer_id: string
        }
        Returns: Json
      }
      set_customer_block_state: {
        Args: {
          change_reason: string
          new_is_blocked: boolean
          target_customer_id: string
        }
        Returns: Json
      }
      set_inventory_archive_state: {
        Args: { p_deleted: boolean; p_inventory_id: string; p_reason?: string }
        Returns: Json
      }
      set_inventory_baseline: {
        Args: { p_baseline: number; p_product_id: string }
        Returns: Json
      }
      set_staff_archive_state: {
        Args: { archived: boolean; change_note: string; target_user_id: string }
        Returns: Json
      }
      settle_payment_webhook: {
        Args: {
          _event: Json
          _event_id: string
          _method: string
          _next_status: string
          _payment_id: string
          _provider_payment_id: string
        }
        Returns: Json
      }
      settle_reservation_balance: {
        Args: { _method?: string; _reservation_id: string }
        Returns: Json
      }
      submit_reservation_receipt: {
        Args: { _receipt_path: string; _reservation_id: string }
        Returns: Json
      }
      sync_product_stock: { Args: { p_product_id: string }; Returns: undefined }
      transition_reservation_status: {
        Args: {
          _expected_status: string
          _next_status: string
          _reservation_id: string
        }
        Returns: Json
      }
      update_profile_and_measurements: {
        Args: {
          _fit_preference: string
          _height?: number
          _measurement_source?: string
          _measurements?: Json
          _per_field_confidence?: Json
          _scan_confidence?: number
          _weight?: number
        }
        Returns: Json
      }
      update_staff_role_v2: {
        Args: { new_role: string; target_user_id: string }
        Returns: Json
      }
      update_staff_status: {
        Args: {
          change_note: string
          new_employment_status: string
          new_is_blocked: boolean
          target_staff_id: string
        }
        Returns: undefined
      }
      update_staff_status_v2: {
        Args: {
          change_note: string
          employment_status: string
          is_blocked: boolean
          target_user_id: string
        }
        Returns: Json
      }
      update_user_streak: { Args: never; Returns: undefined }
      vote_on_review: {
        Args: { p_review_id: string; p_vote_type?: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
