import { ShieldAlert, Github, Mail } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-white">品牌黑红榜</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
              记录品牌是非，守护消费者权益。我们致力于建立一个透明、公正的品牌评价平台，
              帮助消费者做出明智的选择，促进品牌履行社会责任。
            </p>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <Github className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <Mail className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">快速链接</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="/blacklist" className="text-gray-400 hover:text-white transition-colors">黑榜</a></li>
              <li><a href="/redlist" className="text-gray-400 hover:text-white transition-colors">红榜</a></li>
              <li><a href="/search" className="text-gray-400 hover:text-white transition-colors">搜索</a></li>
              <li><a href="/publish" className="text-gray-400 hover:text-white transition-colors">投稿</a></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-white font-semibold mb-4">法律信息</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">服务条款</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">隐私政策</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">免责声明</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">联系我们</a></li>
            </ul>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="border-t border-gray-800 mt-8 pt-8 text-xs text-gray-500">
          <p className="mb-2">
            <strong>免责声明：</strong>本网站内容由用户提交，仅供参考。网站不代表任何立场，不对内容的真实性、准确性承担法律责任。
            如有异议，请联系我们进行核实和处理。
          </p>
          <p>
            © 2024 品牌黑红榜. All rights reserved. 本平台仅用于信息记录与分享，不构成任何投资或消费建议。
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;