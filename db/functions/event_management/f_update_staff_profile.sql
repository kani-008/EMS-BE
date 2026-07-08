DROP FUNCTION IF EXISTS sp_update_staff_profile(VARCHAR,VARCHAR,VARCHAR);
CREATE OR REPLACE FUNCTION sp_update_staff_profile(
  p_username VARCHAR, p_contact VARCHAR, p_updated_by VARCHAR,
  OUT p_success BOOLEAN, OUT p_message VARCHAR
) AS $$
DECLARE
  v_exists INT;
BEGIN
  SELECT COUNT(*) INTO v_exists FROM user_faculty WHERE user_name = p_username;
  IF v_exists = 0 THEN
    p_success := FALSE; p_message := format('Staff user not found: "%s"', p_username);
  ELSE
    UPDATE user_faculty SET contact = p_contact, last_updated_by = p_updated_by WHERE user_name = p_username;
    p_success := TRUE; p_message := 'Profile updated successfully';
  END IF;
END;
$$ LANGUAGE plpgsql;
