-- Migration: Automatic Acknowledgment Response System
-- Automatically sends an acknowledgment message when a customer sends a new message in a conversation,
-- with duplicate prevention across tabs/devices and configurable settings in public.settings.

-- 1. Ensure columns exist on public.messages
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_auto_response BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sender_type TEXT DEFAULT 'customer';

-- 2. Seed default settings for autoReply if not present
INSERT INTO public.settings (key, value, updated_at)
VALUES (
  'autoReply',
  '{"enabled": true, "message": "Thank you for your message! We have received it and notified the Jezsy Staff. Please wait patiently while a staff member reviews your message and responds to you. 💕"}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- 3. Create or replace the auto-acknowledgment trigger function
CREATE OR REPLACE FUNCTION public.handle_auto_acknowledgment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  setting_enabled BOOLEAN := TRUE;
  setting_message TEXT := 'Thank you for your message! We have received it and notified the Jezsy Staff. Please wait patiently while a staff member reviews your message and responds to you. 💕';
  setting_row RECORD;
  last_staff_time TIMESTAMPTZ;
  existing_auto_count INT := 0;
BEGIN
  -- Exit immediately if the inserted message IS ALREADY an auto-response to prevent recursion
  IF NEW.is_auto_response IS TRUE OR NEW.sender_type = 'auto_response' THEN
    RETURN NEW;
  END IF;

  -- Exit if the message was sent by a staff, admin, or owner
  IF NEW.sender_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = NEW.sender_id AND role IN ('staff', 'admin', 'owner') AND deleted IS DISTINCT FROM true
  ) THEN
    RETURN NEW;
  END IF;

  -- Read auto-acknowledgment settings from public.settings
  SELECT (value->>'enabled')::boolean AS enabled, value->>'message' AS message
  INTO setting_row
  FROM public.settings
  WHERE key = 'autoReply';

  IF FOUND THEN
    IF setting_row.enabled IS FALSE THEN
      RETURN NEW; -- Feature disabled by admin
    END IF;
    IF setting_row.message IS NOT NULL AND TRIM(setting_row.message) <> '' THEN
      setting_message := setting_row.message;
    END IF;
  END IF;

  -- Find the timestamp of the latest staff response in this conversation (if any)
  SELECT MAX(created_at) INTO last_staff_time
  FROM public.messages
  WHERE conversation_id = NEW.conversation_id
    AND sender_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = messages.sender_id AND role IN ('staff', 'admin', 'owner') AND deleted IS DISTINCT FROM true
    );

  -- Check if an auto-acknowledgment message has ALREADY been sent in this conversation
  -- after the last staff message (or since the beginning if staff has never replied)
  SELECT COUNT(*) INTO existing_auto_count
  FROM public.messages
  WHERE conversation_id = NEW.conversation_id
    AND (is_auto_response IS TRUE OR sender_type = 'auto_response')
    AND (last_staff_time IS NULL OR created_at >= last_staff_time);

  -- If an auto-reply was already dispatched for the current customer message burst, skip
  IF existing_auto_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Insert the automated acknowledgment message
  INSERT INTO public.messages (
    conversation_id,
    sender_id,
    sender_name,
    text,
    is_auto_response,
    sender_type,
    created_at
  ) VALUES (
    NEW.conversation_id,
    NULL,
    'Jezsy System',
    setting_message,
    TRUE,
    'auto_response',
    NOW() + INTERVAL '10 milliseconds'
  );

  -- Update conversation metadata
  UPDATE public.conversations
  SET last_message = setting_message,
      last_message_time = NOW(),
      updated_at = NOW()
  WHERE id::text = NEW.conversation_id OR custom_id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

-- 4. Create trigger on public.messages
DROP TRIGGER IF EXISTS trg_auto_acknowledgment ON public.messages;

CREATE TRIGGER trg_auto_acknowledgment
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_auto_acknowledgment();
