export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
  public: {
    Tables: {
      dispatches: {
        Row: {
          case_id: string
          created_at: string
          delivered_at: string | null
          dispatch_key: string
          id: string
          payload: Json | null
          status: string
          stripe_session_id: string | null
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          delivered_at?: string | null
          dispatch_key: string
          id?: string
          payload?: Json | null
          status?: string
          stripe_session_id?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          delivered_at?: string | null
          dispatch_key?: string
          id?: string
          payload?: Json | null
          status?: string
          stripe_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatches_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "stripe_sessions"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "dispatches_stripe_session_id_fkey"
            columns: ["stripe_session_id"]
            isOneToOne: false
            referencedRelation: "stripe_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          amparo_legal: string | null
          artigo_ctb: string | null
          case_id: string
          cep: string | null
          cidade: string | null
          cnh: string | null
          cpf: string | null
          created_at: string
          data_infracao: string | null
          descricao_infracao: string | null
          document_status: string | null
          document_url: string | null
          dup_guard: string | null
          email: string
          endereco: string | null
          especie_documento: string | null
          estado: string | null
          expedida_em: string | null
          form_token: string
          id: string
          justificativa: string | null
          local_infracao: string | null
          marca_modelo_especie: string | null
          nome: string
          notificacao_penalidade: string | null
          numero_auto: string | null
          orgao_autuador: string | null
          placa: string | null
          renainf: string | null
          renavam: string | null
          stripe_session_id: string | null
          telefone: string | null
          updated_at: string
          velocidade_aferida: number | null
          velocidade_permitida: number | null
        }
        Insert: {
          amparo_legal?: string | null
          artigo_ctb?: string | null
          case_id: string
          cep?: string | null
          cidade?: string | null
          cnh?: string | null
          cpf?: string | null
          created_at?: string
          data_infracao?: string | null
          descricao_infracao?: string | null
          document_status?: string | null
          document_url?: string | null
          dup_guard?: string | null
          email: string
          endereco?: string | null
          especie_documento?: string | null
          estado?: string | null
          expedida_em?: string | null
          form_token: string
          id?: string
          justificativa?: string | null
          local_infracao?: string | null
          marca_modelo_especie?: string | null
          nome: string
          notificacao_penalidade?: string | null
          numero_auto?: string | null
          orgao_autuador?: string | null
          placa?: string | null
          renainf?: string | null
          renavam?: string | null
          stripe_session_id?: string | null
          telefone?: string | null
          updated_at?: string
          velocidade_aferida?: number | null
          velocidade_permitida?: number | null
        }
        Update: {
          amparo_legal?: string | null
          artigo_ctb?: string | null
          case_id?: string
          cep?: string | null
          cidade?: string | null
          cnh?: string | null
          cpf?: string | null
          created_at?: string
          data_infracao?: string | null
          descricao_infracao?: string | null
          document_status?: string | null
          document_url?: string | null
          dup_guard?: string | null
          email?: string
          endereco?: string | null
          especie_documento?: string | null
          estado?: string | null
          expedida_em?: string | null
          form_token?: string
          id?: string
          justificativa?: string | null
          local_infracao?: string | null
          marca_modelo_especie?: string | null
          nome?: string
          notificacao_penalidade?: string | null
          numero_auto?: string | null
          orgao_autuador?: string | null
          placa?: string | null
          renainf?: string | null
          renavam?: string | null
          stripe_session_id?: string | null
          telefone?: string | null
          updated_at?: string
          velocidade_aferida?: number | null
          velocidade_permitida?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "stripe_sessions"
            referencedColumns: ["case_id"]
          },
        ]
      }
      generated_documents: {
        Row: {
          case_id: string
          created_at: string
          dispatch_key: string
          email_to: string
          error_detail: string | null
          id: string
          provider: string | null
          provider_message_id: string | null
          sent_at: string | null
          sha256: string | null
          status: string
          storage_bucket: string
          storage_path: string
          stripe_session_id: string | null
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          dispatch_key: string
          email_to: string
          error_detail?: string | null
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          sha256?: string | null
          status?: string
          storage_bucket: string
          storage_path: string
          stripe_session_id?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          dispatch_key?: string
          email_to?: string
          error_detail?: string | null
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          sha256?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          stripe_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_dispatch_key_fkey"
            columns: ["dispatch_key"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["dispatch_key"]
          },
          {
            foreignKeyName: "generated_documents_stripe_session_id_fkey"
            columns: ["stripe_session_id"]
            isOneToOne: false
            referencedRelation: "stripe_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      radar_consultas_log: {
        Row: {
          case_id: string
          confianca: string | null
          consultado_em: string
          entrada: Json | null
          id: string
          metodo_match: string | null
          resultado: Json | null
          revisado_em: string | null
          revisado_por: string | null
          status: string | null
        }
        Insert: {
          case_id: string
          confianca?: string | null
          consultado_em?: string
          entrada?: Json | null
          id?: string
          metodo_match?: string | null
          resultado?: Json | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string | null
        }
        Update: {
          case_id?: string
          confianca?: string | null
          consultado_em?: string
          entrada?: Json | null
          id?: string
          metodo_match?: string | null
          resultado?: Json | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radar_consultas_log_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "form_submissions"
            referencedColumns: ["case_id"]
          },
        ]
      }
      radar_faixas: {
        Row: {
          instrument_id: string
          numero_faixa: string
          numero_inmetro: string | null
          numero_serie: string | null
          sentido: string
          velocidade_nominal: number | null
        }
        Insert: {
          instrument_id: string
          numero_faixa?: string
          numero_inmetro?: string | null
          numero_serie?: string | null
          sentido?: string
          velocidade_nominal?: number | null
        }
        Update: {
          instrument_id?: string
          numero_faixa?: string
          numero_inmetro?: string | null
          numero_serie?: string | null
          sentido?: string
          velocidade_nominal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "radar_faixas_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "radar_instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      radar_instruments: {
        Row: {
          data_ultima_verificacao: string | null
          data_validade: string | null
          id: string
          local_via: string | null
          local_via_norm: string | null
          municipio: string | null
          proprietario: string | null
          snapshot_id: string | null
          tipo_medidor: string | null
          uf: string
          ultimo_resultado: string | null
          updated_at: string
        }
        Insert: {
          data_ultima_verificacao?: string | null
          data_validade?: string | null
          id: string
          local_via?: string | null
          local_via_norm?: string | null
          municipio?: string | null
          proprietario?: string | null
          snapshot_id?: string | null
          tipo_medidor?: string | null
          uf?: string
          ultimo_resultado?: string | null
          updated_at?: string
        }
        Update: {
          data_ultima_verificacao?: string | null
          data_validade?: string | null
          id?: string
          local_via?: string | null
          local_via_norm?: string | null
          municipio?: string | null
          proprietario?: string | null
          snapshot_id?: string | null
          tipo_medidor?: string | null
          uf?: string
          ultimo_resultado?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "radar_instruments_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "radar_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      radar_snapshots: {
        Row: {
          bytes: number | null
          fetched_at: string
          id: string
          last_modified: string | null
          pruned_at: string | null
          record_count: number | null
          sha256: string
          source_url: string
          storage_path: string | null
          uf: string
        }
        Insert: {
          bytes?: number | null
          fetched_at?: string
          id?: string
          last_modified?: string | null
          pruned_at?: string | null
          record_count?: number | null
          sha256: string
          source_url: string
          storage_path?: string | null
          uf?: string
        }
        Update: {
          bytes?: number | null
          fetched_at?: string
          id?: string
          last_modified?: string | null
          pruned_at?: string | null
          record_count?: number | null
          sha256?: string
          source_url?: string
          storage_path?: string | null
          uf?: string
        }
        Relationships: []
      }
      radar_verificacoes: {
        Row: {
          ano: number | null
          data_laudo: string
          data_validade: string
          instrument_id: string
          numero_certificado: string
          numero_ensaio: string | null
          origem: string
          resultado: string | null
          tipo_servico: string | null
        }
        Insert: {
          ano?: number | null
          data_laudo: string
          data_validade: string
          instrument_id: string
          numero_certificado?: string
          numero_ensaio?: string | null
          origem: string
          resultado?: string | null
          tipo_servico?: string | null
        }
        Update: {
          ano?: number | null
          data_laudo?: string
          data_validade?: string
          instrument_id?: string
          numero_certificado?: string
          numero_ensaio?: string | null
          origem?: string
          resultado?: string | null
          tipo_servico?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radar_verificacoes_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "radar_instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_sessions: {
        Row: {
          case_id: string
          created_at: string
          event_payload: Json | null
          id: string
          metadata: Json | null
          payment_at: string | null
          payment_status: string
          status: string
          url: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          event_payload?: Json | null
          id: string
          metadata?: Json | null
          payment_at?: string | null
          payment_status?: string
          status?: string
          url?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          event_payload?: Json | null
          id?: string
          metadata?: Json | null
          payment_at?: string | null
          payment_status?: string
          status?: string
          url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attempt_dispatch: {
        Args: { p_case_id: string }
        Returns: {
          dispatch_key: string
        }[]
      }
      confirm_dispatch: {
        Args: { dispatch_key: string; success: boolean }
        Returns: {
          confirmed: boolean
        }[]
      }
      generate_case_id: { Args: never; Returns: string }
      radar_unaccent_imutavel: { Args: { entrada: string }; Returns: string }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

