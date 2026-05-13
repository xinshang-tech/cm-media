export default function BlockedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-6xl">🔒</div>
        <h1 className="text-2xl font-bold">访问被拒绝</h1>
        <p className="text-gray-400">
          您的账号或IP已被封禁<br />
          如有疑问请联系管理员
        </p>
      </div>
    </div>
  );
}
