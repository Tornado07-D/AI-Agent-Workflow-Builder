CREATE OR REPLACE FUNCTION check_owner_for_sensitive_steps() RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID;
    user_role org_role;
    target_org_id UUID;
BEGIN
    current_user_id := (current_setting('hasura.user', true)::jsonb ->> 'x-hasura-user-id')::uuid;
    
    IF current_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT org_id INTO target_org_id FROM workflows WHERE id = NEW.workflow_id;
    
    SELECT role INTO user_role FROM org_members 
    WHERE user_id = current_user_id AND org_id = target_org_id;

    IF TG_TABLE_NAME = 'workflow_steps' THEN
        IF NEW.type IN ('db_write', 'notify') THEN
            IF user_role IS DISTINCT FROM 'owner' THEN
                RAISE EXCEPTION 'Only organization owners can create % steps', NEW.type;
            END IF;
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'workflow_triggers' THEN
        IF NEW.type IN ('webhook', 'database_event') THEN
            IF user_role IS DISTINCT FROM 'owner' THEN
                RAISE EXCEPTION 'Only organization owners can create % triggers', NEW.type;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
