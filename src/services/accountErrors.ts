/** Vietnamese messages for what Supabase / the network can answer */
export function accountErrorMessage(err: unknown): string {
  const raw = String((err as { message?: string })?.message ?? err ?? "");
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email hoặc mật khẩu không đúng.";
  if (m.includes("email not confirmed")) return "Email chưa được xác nhận: mở thư xác nhận rồi đăng nhập lại.";
  if (m.includes("user already registered")) return "Email này đã có tài khoản. Hãy đăng nhập.";
  if (m.includes("password should be at least")) return "Mật khẩu cần ít nhất 6 ký tự.";
  if (m.includes("device limit")) return "Tài khoản đã đồng bộ XP từ quá nhiều máy (tối đa 10). XP của máy này chưa được lên bảng xếp hạng.";
  if (m.includes("rate limit") || m.includes("too many")) return "Thử quá nhiều lần. Đợi một lúc rồi thử lại.";
  if (m.includes("duplicate key") && m.includes("display_name")) return "Tên hiển thị này đã có người dùng.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed")) return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  if (m.includes("invalid invite code")) return "Mã mời không đúng.";
  if (m.includes("too many groups")) return "Bạn đã ở trong 10 nhóm, hãy rời bớt một nhóm.";
  if (m.includes("group is full")) return "Nhóm này đã đầy.";
  return raw || "Có lỗi xảy ra.";
}
