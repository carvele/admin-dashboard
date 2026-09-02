export const formatPHDate = (dateString, options = {}) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", ...options });
};

export const formatPHDateTime = (dateString, options = {}) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", ...options });
};
