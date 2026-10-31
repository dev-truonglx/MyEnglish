import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chính sách quyền riêng tư • Privacy Policy | MyEnglish",
  description:
    "Chính sách quyền riêng tư cho ứng dụng và tiện ích mở rộng MyEnglish trên trình duyệt Chrome và Microsoft Edge.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden select-text bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-200">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html, body {
              height: auto !important;
              min-height: 100% !important;
              overflow-y: auto !important;
              overflow-x: hidden !important;
              user-select: text !important;
            }
          `,
        }}
      />
      <main className="min-h-full py-12 px-4 sm:px-6 lg:px-8 selection:bg-cyan-500 selection:text-white">
        <div className="max-w-4xl mx-auto space-y-10">
        {/* Header */}
        <header className="border-b border-slate-200 dark:border-zinc-800 pb-8 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
            <img
              src="/app-icon.png"
              alt="MyEnglish Logo"
              className="w-16 h-16 rounded-2xl shadow-md border border-slate-200 dark:border-zinc-800"
            />
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 mb-1">
                <span>Chính sách quyền riêng tư</span>
                <span>•</span>
                <span>Privacy Policy</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                MyEnglish
              </h1>
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            <strong>Ngày cập nhật lần cuối (Last Updated):</strong> 31 tháng 10, 2026 (October 31, 2026)
          </p>
        </header>

        {/* Introduction */}
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-2 h-6 bg-cyan-500 rounded-full" />
            1. Giới thiệu & Cam kết cốt lõi (Overview & Core Commitment)
          </h2>
          <div className="prose dark:prose-invert max-w-none text-sm sm:text-base leading-relaxed space-y-3">
            <p>
              Chào mừng bạn đến với <strong>MyEnglish</strong> — ứng dụng và tiện ích mở rộng trình duyệt (Chrome &
              Microsoft Edge Extension) hỗ trợ học tiếng Anh thông minh với thuật toán lặp lại ngắt quãng FSRS (Free
              Spaced Repetition Scheduler), hệ thống từ vựng chuẩn Oxford 5000 và 31 chủ điểm ngữ pháp.
            </p>
            <p>
              Chúng tôi cam kết bảo vệ quyền riêng tư của bạn bằng nguyên tắc <strong>Ưu tiên dữ liệu cục bộ (Local-First)</strong>.
              Dữ liệu học tập của bạn trước hết được lưu trữ an toàn trên chính thiết bị cá nhân của bạn. Chúng tôi{" "}
              <strong>KHÔNG</strong> bán, không cho thuê và không chia sẻ thông tin cá nhân của bạn cho bất kỳ đơn vị quảng
              cáo hoặc bên thứ ba nào.
            </p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 italic bg-slate-100 dark:bg-zinc-900 p-3 rounded-xl border border-slate-200 dark:border-zinc-800">
              <strong>English Summary:</strong> MyEnglish is a local-first English learning app and browser extension
              (Chrome & Edge). We respect your privacy. We do not sell your personal data or track your web browsing.
              Your learning data is stored locally on your device by default, with optional encrypted cloud backup via
              Supabase.
            </p>
          </div>
        </section>

        {/* Data We Collect */}
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-2 h-6 bg-cyan-500 rounded-full" />
            2. Dữ liệu chúng tôi thu thập (Information We Collect)
          </h2>
          <div className="text-sm sm:text-base leading-relaxed space-y-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm space-y-2">
              <h3 className="font-bold text-slate-900 dark:text-white">a. Dữ liệu học tập cục bộ (Local Learning Data)</h3>
              <p className="text-slate-600 dark:text-zinc-400 text-sm">
                Bao gồm tiến độ học tập, lịch sử đánh giá thẻ FSRS, sổ tay từ vựng, ghi chú ngữ pháp và điểm chuỗi học tập
                (streak). Những dữ liệu này được lưu trữ hoàn toàn nội bộ trên thiết bị của bạn bằng công nghệ cơ sở dữ
                liệu cục bộ (SQLite / Origin Private File System / Chrome Storage).
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm space-y-2">
              <h3 className="font-bold text-slate-900 dark:text-white">b. Dữ liệu tài khoản & Đồng bộ đám mây (Tùy chọn)</h3>
              <p className="text-slate-600 dark:text-zinc-400 text-sm">
                Nếu bạn chủ động đăng ký tài khoản để đồng bộ tiến độ học giữa các máy tính hoặc giữa bản Web và Extension,
                chúng tôi lưu trữ địa chỉ email và mật khẩu đã được mã hóa một chiều thông qua nhà cung cấp xác thực bảo
                mật <strong>Supabase</strong>. Bạn hoàn toàn có thể sử dụng đầy đủ mọi tính năng của MyEnglish ở chế độ ngoại
                tuyến mà không cần tạo tài khoản.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 shadow-sm space-y-2">
              <h3 className="font-bold text-emerald-900 dark:text-emerald-300">c. Những gì chúng tôi KHÔNG thu thập (What We Do NOT Collect)</h3>
              <ul className="list-disc list-inside text-sm text-emerald-800 dark:text-emerald-400 space-y-1">
                <li>KHÔNG thu thập lịch sử duyệt web hay danh sách trang web bạn ghé thăm.</li>
                <li>KHÔNG ghi nhận thao tác bàn phím (keystroke logging) trên các trang web khác.</li>
                <li>KHÔNG thu thập thông tin tài chính, số thẻ thanh toán hay vị trí GPS.</li>
                <li>KHÔNG sử dụng cookie theo dõi của bên thứ ba phục vụ mục đích quảng cáo.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Chrome & Edge Extension Permissions Rationale */}
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-2 h-6 bg-cyan-500 rounded-full" />
            3. Mục đích sử dụng các quyền trên Tiện ích mở rộng (Extension Permissions Rationale)
          </h2>
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Tiện ích MyEnglish trên Chrome Web Store và Microsoft Edge Add-ons chỉ yêu cầu các quyền tối thiểu cần thiết để
            cung cấp các tính năng học tập:
          </p>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-100 dark:bg-zinc-800/80 text-slate-900 dark:text-white font-semibold border-b border-slate-200 dark:border-zinc-700">
                <tr>
                  <th className="p-3.5 sm:p-4">Quyền (Permission)</th>
                  <th className="p-3.5 sm:p-4">Mục đích sử dụng (Purpose)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                <tr>
                  <td className="p-3.5 sm:p-4 font-mono font-medium text-cyan-600 dark:text-cyan-400">
                    storage / unlimitedStorage
                  </td>
                  <td className="p-3.5 sm:p-4 text-slate-600 dark:text-zinc-300">
                    Lưu trữ cơ sở dữ liệu từ vựng Oxford 5000, ngữ pháp và trạng thái ôn tập FSRS ngoại tuyến ngay trên máy
                    tính mà không bị giới hạn dung lượng lưu trữ cục bộ.
                  </td>
                </tr>
                <tr>
                  <td className="p-3.5 sm:p-4 font-mono font-medium text-cyan-600 dark:text-cyan-400">alarms</td>
                  <td className="p-3.5 sm:p-4 text-slate-600 dark:text-zinc-300">
                    Lên lịch kiểm tra ngầm định kỳ (mỗi 15 phút) để cập nhật số lượng thẻ cần ôn tập đến hạn lên biểu tượng
                    tiện ích và nhắc nhở đúng lúc.
                  </td>
                </tr>
                <tr>
                  <td className="p-3.5 sm:p-4 font-mono font-medium text-cyan-600 dark:text-cyan-400">notifications</td>
                  <td className="p-3.5 sm:p-4 text-slate-600 dark:text-zinc-300">
                    Hiển thị thông báo màn hình hệ điều hành khi có từ vựng cần ôn tập đến hạn, giúp người học duy trì thói
                    quen học mà không bỏ lỡ khoảng ngắt quãng tối ưu.
                  </td>
                </tr>
                <tr>
                  <td className="p-3.5 sm:p-4 font-mono font-medium text-cyan-600 dark:text-cyan-400">sidePanel</td>
                  <td className="p-3.5 sm:p-4 text-slate-600 dark:text-zinc-300">
                    Cung cấp giao diện học tập nhanh ở thanh bên (Side Panel) của trình duyệt để bạn ôn tập từ vựng tiện lợi
                    mà không phải chuyển tab làm việc.
                  </td>
                </tr>
                <tr>
                  <td className="p-3.5 sm:p-4 font-mono font-medium text-cyan-600 dark:text-cyan-400">contextMenus</td>
                  <td className="p-3.5 sm:p-4 text-slate-600 dark:text-zinc-300">
                    Tạo mục menu chuột phải khi bạn bôi đen 1 từ vựng tiếng Anh trên bất kỳ trang web nào để tra cứu nghĩa
                    nhanh trong MyEnglish.
                  </td>
                </tr>
                <tr>
                  <td className="p-3.5 sm:p-4 font-mono font-medium text-cyan-600 dark:text-cyan-400">
                    host_permissions (Supabase)
                  </td>
                  <td className="p-3.5 sm:p-4 text-slate-600 dark:text-zinc-300">
                    Chỉ kết nối duy nhất tới máy chủ cơ sở dữ liệu Supabase để đồng bộ tiến độ học tập khi bạn đăng nhập tài
                    khoản.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Data Storage & Security */}
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-2 h-6 bg-cyan-500 rounded-full" />
            4. Bảo mật & Lưu trữ dữ liệu (Data Storage & Security)
          </h2>
          <div className="prose dark:prose-invert max-w-none text-sm sm:text-base leading-relaxed space-y-3">
            <p>
              Chúng tôi áp dụng các tiêu chuẩn an ninh nghiêm ngặt để bảo vệ dữ liệu người dùng:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-600 dark:text-zinc-300">
              <li>
                <strong>Mã hóa đường truyền:</strong> Mọi dữ liệu đồng bộ đám mây đều được truyền qua kết nối mã hóa
                HTTPS/TLS 1.3 an toàn.
              </li>
              <li>
                <strong>Bảo mật cấp hàng (Row Level Security):</strong> Trên máy chủ cơ sở dữ liệu Supabase, mỗi người dùng
                chỉ có quyền xem và sửa đổi dữ liệu thuộc về chính tài khoản của mình.
              </li>
              <li>
                <strong>Cách ly môi trường:</strong> Bản tiện ích mở rộng chạy trong môi trường sandbox biệt lập của trình
                duyệt, tuân thủ nghiêm ngặt Chính sách bảo mật nội dung (Manifest V3 Content Security Policy).
              </li>
            </ul>
          </div>
        </section>

        {/* User Rights & Deletion */}
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-2 h-6 bg-cyan-500 rounded-full" />
            5. Quyền kiểm soát & Xóa dữ liệu (User Rights & Data Deletion)
          </h2>
          <div className="prose dark:prose-invert max-w-none text-sm sm:text-base leading-relaxed space-y-3">
            <p>
              Bạn luôn nắm toàn quyền sở hữu đối với dữ liệu học tập của mình:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-600 dark:text-zinc-300">
              <li>
                <strong>Xuất dữ liệu (Data Export):</strong> Bạn có thể xuất toàn bộ từ vựng cá nhân, tiến độ học tập và
                sổ tay từ vựng bất kỳ lúc nào dưới dạng tệp dữ liệu trong mục Cài đặt.
              </li>
              <li>
                <strong>Xóa dữ liệu cục bộ (Local Wipe):</strong> Bạn có thể xóa toàn bộ dữ liệu lưu trữ trên trình duyệt
                bằng chức năng "Khôi phục / Xóa dữ liệu" trong mục Cài đặt của ứng dụng.
              </li>
              <li>
                <strong>Xóa tài khoản đám mây (Account Deletion):</strong> Nếu đã tạo tài khoản đồng bộ, bạn có thể gửi yêu
                cầu xóa vĩnh viễn tài khoản và toàn bộ bản ghi đám mây bằng cách liên hệ với chúng tôi qua email.
              </li>
            </ul>
          </div>
        </section>

        {/* Children's Privacy */}
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-2 h-6 bg-cyan-500 rounded-full" />
            6. Quyền riêng tư của trẻ em (Children's Privacy)
          </h2>
          <div className="prose dark:prose-invert max-w-none text-sm sm:text-base leading-relaxed space-y-2">
            <p className="text-slate-600 dark:text-zinc-300">
              MyEnglish được thiết kế phục vụ mục đích giáo dục cho mọi đối tượng học sinh, sinh viên và người đi làm. Ứng
              dụng không cố ý thu thập bất kỳ thông tin nhận dạng cá nhân nào từ trẻ em dưới 13 tuổi. Nếu bạn là phụ huynh
              hoặc người giám hộ và phát hiện con bạn đã đăng ký tài khoản với chúng tôi, vui lòng liên hệ để chúng tôi xóa
              dữ liệu ngay lập tức.
            </p>
          </div>
        </section>

        {/* Changes to Policy */}
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-2 h-6 bg-cyan-500 rounded-full" />
            7. Thay đổi chính sách (Changes to Policy)
          </h2>
          <div className="prose dark:prose-invert max-w-none text-sm sm:text-base leading-relaxed space-y-2">
            <p className="text-slate-600 dark:text-zinc-300">
              Chúng tôi có thể cập nhật chính sách này theo thời gian nhằm phản ánh các cải tiến về tính năng hoặc tuân thủ
              các quy định pháp lý mới. Mọi cập nhật sẽ được công bố trực tiếp tại trang này kèm theo ngày có hiệu lực mới
              nhất.
            </p>
          </div>
        </section>

        {/* Contact Us */}
        <section className="space-y-4 pb-12">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-2 h-6 bg-cyan-500 rounded-full" />
            8. Thông tin liên hệ (Contact Us)
          </h2>
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm text-sm space-y-2">
            <p className="text-slate-700 dark:text-zinc-300">
              Nếu bạn có bất kỳ câu hỏi, góp ý hoặc yêu cầu nào liên quan đến chính sách quyền riêng tư này hoặc dữ liệu
              của bạn, xin vui lòng liên hệ với chúng tôi:
            </p>
            <div className="pt-2 text-sm">
              <p>
                <strong>Ứng dụng (Application):</strong> MyEnglish
              </p>
              <p>
                <strong>Email hỗ trợ (Support Email):</strong>{" "}
                <a
                  href="mailto:truonglx.dev@gmail.com"
                  className="text-cyan-600 dark:text-cyan-400 hover:underline font-medium"
                >
                  truonglx.dev@gmail.com
                </a>
              </p>
              <p>
                <strong>Nền tảng hỗ trợ (Supported Platforms):</strong> Web App, Chrome Extension, Microsoft Edge Add-on,
                Desktop App
              </p>
            </div>
          </div>
        </section>

        {/* Footer note */}
        <footer className="border-t border-slate-200 dark:border-zinc-800 pt-6 text-center text-xs text-slate-500 dark:text-zinc-500">
          <p>© {new Date().getFullYear()} MyEnglish. Toàn bộ quyền được bảo lưu (All rights reserved).</p>
        </footer>
      </div>
    </main>
  </div>
  );
}
