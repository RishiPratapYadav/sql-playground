-- Parse first name, last name, and email from a single column
-- Assumes format: "FirstName LastName <email@domain.com>"

SELECT 
    TRIM(SUBSTRING_INDEX(full_info, '<', 1)) AS full_name,
    TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(full_info, ' ', 1), '<', 1)) AS first_name,
    TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(full_info, ' ', 2), '<', 1)) AS last_name,
    TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(full_info, '<', -1), '>', 1)) AS email
FROM your_table;