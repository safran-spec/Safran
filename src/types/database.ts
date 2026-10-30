export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** `admin` is the legacy value; the application maps it to `restaurant_admin`. */
export type AppRole =
  | "customer"
  | "admin"
  | "restaurant_staff"
  | "restaurant_admin"
  | "rider"
  | "platform_admin";
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "completed"
  | "cancelled";
export type FulfillmentType = "pickup" | "delivery";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type PrintJobStatus =
  | "pending"
  | "printing"
  | "printed"
  | "failed"
  | "cancelled";
export type PrintTriggerSource = "order_created" | "manual_reprint" | "retry";

type TableDefinition<Row, Insert, Update = Partial<Insert>, Relationships = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
};

export type Profile = {
  id: string;
  role: AppRole;
  display_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

export type MenuCategoryRecord = {
  id: string;
  title: string;
  subtitle: string | null;
  note_de: string | null;
  note_en: string | null;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MenuItemRecord = {
  id: number;
  category_id: string;
  item_number: number;
  name: string;
  description_de: string | null;
  description_en: string | null;
  price: number;
  /** 0–99; the charged price is `price` reduced by this share. */
  discount_percent: number;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SiteSetting = {
  key: string;
  value: Json;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type ContentBlock = {
  key: string;
  title: string | null;
  body: string | null;
  data: Json;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type OpeningHour = {
  weekday: number;
  day_of_week: number;
  is_closed: boolean;
  lunch_opens: string | null;
  lunch_closes: string | null;
  dinner_opens: string | null;
  dinner_closes: string | null;
  open_time: string | null;
  close_time: string | null;
  second_open_time: string | null;
  second_close_time: string | null;
  note: string | null;
  updated_at: string;
};

export type StoreAvailability = {
  id: boolean;
  accepts_orders: boolean;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  minimum_notice_minutes: number;
  paused_reason: string | null;
  updated_at: string;
};

export type Order = {
  id: string;
  order_number: string;
  confirmation_token: string;
  idempotency_key: string | null;
  user_id: string | null;
  status: OrderStatus;
  fulfillment_type: FulfillmentType;
  payment_status: PaymentStatus;
  payment_method: string;
  payment_provider: string | null;
  payment_reference: string | null;
  accepted_no_cancellation: boolean;
  currency: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  delivery_address: Json | null;
  customer_notes: string | null;
  customer_note: string | null;
  /** Language the guest ordered in; drives confirmation email wording. */
  locale: "de" | "en";
  requested_for: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: number;
  order_id: string;
  menu_item_id: number | null;
  item_number: number | null;
  name: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  notes: string | null;
  created_at: string;
};

export type CheckoutPaymentDraft = {
  id: string;
  idempotency_key: string;
  confirmation_token: string;
  order_data: Json;
  items: Json;
  payment_reference: string | null;
  order_id: string | null;
  created_at: string;
};

export type OrderStatusEvent = {
  id: number;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
};

export type PrintJob = {
  id: string;
  order_id: string;
  status: PrintJobStatus;
  trigger_source: PrintTriggerSource;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  printed_at: string | null;
  payload: Json;
  created_at: string;
  updated_at: string;
};

export type StoreSettings = {
  id: string;
  restaurant_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  minimum_order: number;
  pickup_minimum: number;
  delivery_fee: number;
  is_open: boolean;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  minimum_notice_minutes: number;
  closed_message: string | null;
};

export type DeliveryZoneMinimum = {
  id: number;
  postal_code: string;
  minimum_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: TableDefinition<
        Profile,
        {
          id: string;
          role?: AppRole;
          display_name?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      menu_categories: TableDefinition<
        MenuCategoryRecord,
        {
          id: string;
          title: string;
          subtitle?: string | null;
          note_de?: string | null;
          note_en?: string | null;
          image_path?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      menu_items: TableDefinition<
        MenuItemRecord,
        {
          id?: number;
          category_id: string;
          item_number: number;
          name: string;
          description_de?: string | null;
          description_en?: string | null;
          price: number;
          discount_percent?: number;
          image_path?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      site_settings: TableDefinition<
        SiteSetting,
        {
          key: string;
          value?: Json;
          description?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      delivery_zone_minimums: TableDefinition<
        DeliveryZoneMinimum,
        {
          id?: number;
          postal_code: string;
          minimum_order: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      content_blocks: TableDefinition<
        ContentBlock,
        {
          key: string;
          title?: string | null;
          body?: string | null;
          data?: Json;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      opening_hours: TableDefinition<
        OpeningHour,
        {
          weekday: number;
          is_closed?: boolean;
          lunch_opens?: string | null;
          lunch_closes?: string | null;
          dinner_opens?: string | null;
          dinner_closes?: string | null;
          note?: string | null;
          updated_at?: string;
        }
      >;
      store_availability: TableDefinition<
        StoreAvailability,
        {
          id?: boolean;
          accepts_orders?: boolean;
          pickup_enabled?: boolean;
          delivery_enabled?: boolean;
          minimum_notice_minutes?: number;
          paused_reason?: string | null;
          updated_at?: string;
        }
      >;
      orders: TableDefinition<
        Order,
        {
          id?: string;
          order_number?: string;
          confirmation_token?: string;
          idempotency_key?: string | null;
          user_id?: string | null;
          status?: OrderStatus;
          fulfillment_type: FulfillmentType;
          payment_status?: PaymentStatus;
          payment_method?: string;
          payment_provider?: string | null;
          payment_reference?: string | null;
          accepted_no_cancellation?: boolean;
          currency?: string;
          subtotal: number;
          delivery_fee?: number;
          total: number;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          address_line1?: string | null;
          address_line2?: string | null;
          postal_code?: string | null;
          city?: string | null;
          delivery_address?: Json | null;
          customer_notes?: string | null;
          locale?: "de" | "en";
          requested_for?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      checkout_payment_drafts: TableDefinition<
        CheckoutPaymentDraft,
        {
          id?: string;
          idempotency_key: string;
          confirmation_token: string;
          order_data: Json;
          items: Json;
          payment_reference?: string | null;
          order_id?: string | null;
          created_at?: string;
        }
      >;
      order_items: TableDefinition<
        OrderItem,
        {
          id?: number;
          order_id: string;
          menu_item_id?: number | null;
          item_number?: number | null;
          name: string;
          unit_price: number;
          quantity: number;
          line_total: number;
          notes?: string | null;
          created_at?: string;
        },
        Partial<{
          id: number;
          order_id: string;
          menu_item_id: number | null;
          item_number: number | null;
          name: string;
          unit_price: number;
          quantity: number;
          line_total: number;
          notes: string | null;
          created_at: string;
        }>,
        [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ]
      >;
      order_status_events: TableDefinition<
        OrderStatusEvent,
        {
          id?: number;
          order_id: string;
          from_status?: OrderStatus | null;
          to_status: OrderStatus;
          changed_by?: string | null;
          note?: string | null;
          created_at?: string;
        },
        Partial<{
          id: number;
          order_id: string;
          from_status: OrderStatus | null;
          to_status: OrderStatus;
          changed_by: string | null;
          note: string | null;
          created_at: string;
        }>,
        [
          {
            foreignKeyName: "order_status_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ]
      >;
      print_jobs: TableDefinition<
        PrintJob,
        {
          id?: string;
          order_id: string;
          status?: PrintJobStatus;
          trigger_source?: PrintTriggerSource;
          attempts?: number;
          max_attempts?: number;
          next_attempt_at?: string;
          last_error?: string | null;
          printed_at?: string | null;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
        },
        Partial<{
          id: string;
          order_id: string;
          status: PrintJobStatus;
          trigger_source: PrintTriggerSource;
          attempts: number;
          max_attempts: number;
          next_attempt_at: string;
          last_error: string | null;
          printed_at: string | null;
          payload: Json;
          created_at: string;
          updated_at: string;
        }>,
        [
          {
            foreignKeyName: "print_jobs_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ]
      >;
    };
    Views: {
      store_settings: {
        Row: StoreSettings;
        Relationships: [];
      };
    };
    Functions: {
      create_cash_order: {
        Args: {
          p_order: Json;
          p_items: Json;
        };
        Returns: Json;
      };
      complete_stripe_checkout_draft: {
        Args: {
          p_draft_id: string;
          p_confirmation_token: string;
          p_payment_reference: string;
          p_amount_received: number;
          p_currency: string;
        };
        Returns: Json;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      can_manage_orders: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      app_role: AppRole;
      order_status: OrderStatus;
      fulfillment_type: FulfillmentType;
      payment_status: PaymentStatus;
      print_job_status: PrintJobStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}
