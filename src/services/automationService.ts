import { supabase } from '../lib/supabase';

export interface AutomationContext {
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  amount?: number;
  invoice_number?: string;
  appointment_type?: string;
  appointment_time?: string;
  product_name?: string;
  stock_quantity?: number;
  [key: string]: string | number | undefined;
}

function interpolate(template: string, ctx: AutomationContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    ctx[key] != null ? String(ctx[key]) : ''
  );
}

function buildWhatsAppUrl(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

export async function fireAutomation(
  triggerEvent: string,
  context: AutomationContext
): Promise<void> {
  try {
    const { data: rules } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('trigger_event', triggerEvent)
      .eq('is_active', true);

    if (!rules || rules.length === 0) return;

    for (const rule of rules) {
      const cfg: Record<string, string> = rule.action_config || {};
      const actionType: string = rule.action_type;

      let message = '';
      let actionUrl: string | undefined;

      if (actionType === 'send_whatsapp') {
        const phone = cfg.phone_number
          ? interpolate(cfg.phone_number, context)
          : context.customer_phone || '';
        const tpl =
          cfg.message_template ||
          `Hi {{customer_name}}, your {{entity_type}} {{entity_name}} update. Thank you for choosing us!`;
        const text = interpolate(tpl, context);
        message = phone
          ? `WhatsApp to ${phone}: ${text}`
          : `WhatsApp (no phone): ${text}`;
        if (phone) actionUrl = buildWhatsAppUrl(phone, text);

      } else if (actionType === 'send_email') {
        const email = cfg.email_address
          ? interpolate(cfg.email_address, context)
          : context.customer_email || '';
        const subject = cfg.subject_template
          ? interpolate(cfg.subject_template, context)
          : `Update: ${context.entity_name || triggerEvent}`;
        const body = cfg.body_template
          ? interpolate(cfg.body_template, context)
          : `Hi ${context.customer_name || 'there'}, ${subject}.`;
        message = `Email to ${email || 'customer'}: ${subject}`;
        if (email) {
          actionUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        }

      } else if (actionType === 'create_reminder') {
        const tpl =
          cfg.message_template ||
          `Reminder: {{entity_type}} {{entity_name}} — {{trigger_event}}`;
        message = interpolate(tpl, { ...context, trigger_event: triggerEvent });

      } else if (actionType === 'update_status') {
        message = `Status update triggered for ${context.entity_name || context.entity_type || 'entity'}`;
      }

      await supabase.from('reminders').insert({
        automation_rule_id: rule.id,
        rule_name: rule.name,
        trigger_event: triggerEvent,
        entity_type: context.entity_type ?? null,
        entity_id: context.entity_id ?? null,
        entity_name: context.entity_name ?? null,
        message,
        action_type: actionType,
        action_url: actionUrl ?? null,
      });
    }
  } catch (err) {
    console.error('[Automation] fireAutomation error:', err);
  }
}
