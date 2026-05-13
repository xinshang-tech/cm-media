export default function WeChatBlockedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-6xl">🚫</div>
        <h1 className="text-2xl font-bold">请使用浏览器打开</h1>
        <p className="text-gray-400">
          本站不支持在微信内浏览<br />
          请点击右上角 ··· 选择「在浏览器中打开」
        </p>
        <div className="mt-8 p-4 bg-gray-900 rounded-md text-left text-sm text-gray-500">
          <p>推荐使用：</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Safari (iOS)</li>
            <li>Chrome (Android)</li>
            <li>系统自带浏览器</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
