// support_controller.js - 客服中心交互逻辑
// 版本：5.1 - 弹窗嵌入客服页面（无额外头部，无滚动条，优化尺寸）

class SupportController {
    constructor() {
        this.init();
    }

    init() {
        document.body.classList.add('ready');
        
        this.faqData = {
            guide: [
                {
                    q: 'How do I get started with FOOTRADAPRO?',
                    a: '<div style="margin-bottom: 12px;">The onboarding process is simple and efficient, allowing users to complete the experience in a very short time:</div>' +
                       '<div style="margin-bottom: 8px;"><span style="font-weight: 600; color: #FF6B00;">1.</span> The platform adopts a sandbox mechanism. After registration, new users receive <span style="font-weight: 600; color: #FF6B00;">10,000 USDT test funds</span> to experience the system\'s features risk-free.</div>' +
                       '<div style="margin-bottom: 8px;"><span style="font-weight: 600; color: #FF6B00;">2.</span> Enter the <span style="font-weight: 600;">Match Market</span> and select a match that aligns with your strategy preferences.</div>' +
                       '<div style="margin-bottom: 8px;"><span style="font-weight: 600; color: #FF6B00;">3.</span> Submit a <span style="font-weight: 600;">one-click authorization</span> to complete the strategy locking and execution configuration.</div>' +
                       '<div style="margin-top: 12px;">The entire process is designed to be highly streamlined and can typically be completed within <span style="font-weight: 600; color: #FF6B00;">2 minutes</span>, helping new users quickly get started and experience the complete intelligent operation cycle.</div>'
                },
                {
                    q: 'How does the 10,000 USDT test fund work?',
                    a: '<div style="margin-bottom: 12px;">The <span style="font-weight: 600; color: #FF6B00;">10,000 USDT test fund</span> is provided exclusively for <span style="font-weight: 600;">every user</span> to experience our complete rule-locked authorization system with <span style="font-weight: 600; color: #FF6B00;">zero risk</span>.</div>' +
                       '<div style="margin-bottom: 8px;">You can use it for your first authorization. After settlement, you can view detailed settlement results and a <span style="font-weight: 600;">post-match analysis report</span> of the system\'s decision-making process.</div>' +
                       '<div>This allows you to fully experience the exact same operational process as our partners.</div>'
                },
                {
                    q: 'Is there a minimum deposit requirement?',
                    a: '<div style="margin-bottom: 12px;">No, there is <span style="font-weight: 600; color: #FF6B00;">no mandatory deposit</span>. You can fully experience the platform for free using your <span style="font-weight: 600;">10,000 USDT test funds</span>.</div>' +
                       '<div style="margin-bottom: 12px;">If you choose to make a deposit, the minimum amount is <span style="font-weight: 600; color: #FF6B00;">100 USDT</span>.</div>' +
                       '<div>If you do not have an exchange or cold wallet for depositing, please <span style="font-weight: 600;">contact our support team</span> and send the message "I need to deposit". A specialist will provide professional assistance.</div>'
                }
            ],
            auth: [
                {
                    q: 'What is One-Click Authorization and how does it work?',
                    a: '<div style="margin-bottom: 12px;"><span style="font-weight: 600; color: #FF6B00;">One-Click Authorization</span> is a core feature. With a single click, users can lock in strategy rules and submit an authorization for a specific football match.</div>' +
                       '<div style="margin-bottom: 12px;">After submission, all rules are sealed with high-strength encryption, ensuring the entire process is immutable - no entity, including the platform, can modify or interfere.</div>' +
                       '<div style="margin-bottom: 12px;">The AI system analyzes vast historical data, team form, tactics, and real-time match conditions to generate optimal strategy configurations and execute them automatically according to predefined rules, eliminating human intervention.</div>' +
                       '<div>After the match concludes, the system automatically completes settlement based on official results, ensuring transparency, accuracy, and efficiency.</div>'
                },
                {
                    q: 'Can I cancel an authorization after submitting it?',
                    a: '<div style="margin-bottom: 12px;"><span style="font-weight: 600; color: #FF6B00;">No.</span> Before authorization is confirmed, the system will prompt you to enter a two-factor verification password for confirmation.</div>' +
                       '<div>Once authorized, the system is trusted, and the authorization is permanently locked. It cannot be canceled, modified, or interfered with in any way.</div>'
                },
                {
                    q: 'How accurate is the AI prediction model?',
                    a: '<div style="margin-bottom: 12px;">Our AI model maintains a historical average win rate of over <span style="font-weight: 600; color: #FF6B00;">82%</span> across all major leagues.</div>' +
                       '<div>For high-confidence predictions (estimated win rate exceeding 85%), the average accuracy reaches <span style="font-weight: 600; color: #FF6B00;">91%</span>.</div>'
                },
                {
                    q: 'View Historical Reports',
                    a: '<div style="text-align: center; margin: 16px 0;"><a href="/platform-reports.html" style="display: inline-block; background: linear-gradient(135deg, #FF6B00, #FF4500); color: white; border: none; border-radius: 30px; padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.2s; box-shadow: 0 4px 12px rgba(255,107,0,0.3);">📊 Click to View Historical Reports</a></div>'
                }
            ],
            funds: [
                {
                    q: 'When is the settlement completed after a match ends?',
                    a: '<div style="margin-bottom: 12px;">Settlement is completed automatically within <span style="font-weight: 600; color: #FF6B00;">5 minutes</span> after the official final result of the match is confirmed.</div>' +
                       '<div style="margin-bottom: 12px;">We verify the result across three independent official data sources to ensure accuracy.</div>' +
                       '<div>Once settled, funds are immediately credited to your wallet balance.</div>'
                },
                {
                    q: 'What are the withdrawal fees and processing time?',
                    a: '<div style="margin-bottom: 12px;">We have fixed the withdrawal fee at <span style="font-weight: 600; color: #FF6B00;">1 USDT</span>.</div>' +
                       '<div style="margin-bottom: 8px;">Withdrawals are processed within <span style="font-weight: 600; color: #FF6B00;">2 hours</span>; for supported networks, most withdrawals are completed within 5-20 minutes.</div>' +
                       '<div>There is <span style="font-weight: 600; color: #FF6B00;">no maximum withdrawal limit</span> for any user.</div>'
                },
                {
                    q: 'Is my funds secure on FOOTRADAPRO?',
                    a: '<div style="margin-bottom: 12px;"><span style="font-weight: 600; color: #FF6B00;">Yes.</span> User funds are held in segregated cold wallets, completely separate from our operational funds.</div>' +
                       '<div style="margin-bottom: 12px;">All transactions are recorded on an immutable ledger, and we undergo quarterly third-party security audits.</div>' +
                       '<div>Our rule-locked system ensures that funds can only be moved according to your pre-agreed authorization rules, with no manual access possible.</div>'
                }
            ],
            contact: [
                {
                    q: 'How can I contact support?',
                    a: '<div style="margin-bottom: 12px;">You can reach us through the following channels:</div>' +
                       '<div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;"><i class="fas fa-envelope" style="color: #FF6B00; width: 20px;"></i> <span style="font-weight: 600;">Email:</span> support@footradapro.com (Response within 24 hours)</div>' +
                       '<div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;"><i class="fab fa-telegram" style="color: #FF6B00; width: 20px;"></i> <span style="font-weight: 600;">Telegram:</span> Join our community for instant help</div>' +
                       '<div style="display: flex; align-items: center; gap: 8px;"><i class="fab fa-twitter" style="color: #FF6B00; width: 20px;"></i> <span style="font-weight: 600;">Twitter / X:</span> Follow us for the latest updates</div>'
                },
                {
                    q: 'What are your support hours?',
                    a: '<div>Our support team is available <span style="font-weight: 600; color: #FF6B00;">24/7</span>. Email responses are typically within 24 hours on business days, while Telegram and the upcoming live chat offer faster response times.</div>'
                },
                {
                    q: 'Do you offer live chat support?',
                    a: '<div><span style="font-weight: 600; color: #FF6B00;">Live chat is coming soon!</span> In the meantime, please use email or Telegram for the fastest response.</div>'
                }
            ]
        };
        
        this.bindEvents();
        this.initSearch();
        this.initTheme();
    }

    bindEvents() {
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (document.referrer) {
                    window.history.back();
                } else {
                    window.location.href = '/';
                }
            });
        }

        document.querySelectorAll('.function-card').forEach(card => {
            card.addEventListener('click', () => {
                const target = card.dataset.target;
                
                if (target === 'contact') {
                    this.openContactModal();
                } else if (target === 'auth') {
                    window.location.href = '/faq-auth.html';
                } else {
                    const data = this.faqData[target];
                    if (data) {
                        const encodedData = encodeURIComponent(JSON.stringify({
                            title: this.getCategoryTitle(target),
                            desc: this.getCategoryDesc(target),
                            questions: data
                        }));
                        window.location.href = `/faq-list.html?cat=${target}&data=${encodedData}`;
                    }
                }
            });
        });

        // Live Chat 按钮 - 弹窗嵌入客服页面
        const liveChatBtn = document.getElementById('liveChatBtn');
        if (liveChatBtn) {
            liveChatBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openChatModal();
            });
        }
    }

    getCategoryTitle(category) {
        const titles = {
            guide: 'New User Guide',
            auth: 'Authorization',
            funds: 'Funds & Settlement'
        };
        return titles[category] || 'FAQs';
    }

    getCategoryDesc(category) {
        const descs = {
            guide: 'Everything you need to know to get started',
            auth: 'Understanding our core rule-locked system',
            funds: 'Deposits, withdrawals, and settlement'
        };
        return descs[category] || 'Select a question to view the answer';
    }

    openContactModal() {
        const modal = document.getElementById('faqModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalContent');
        
        if (!modal) {
            this.createModal();
            return;
        }
        
        modalTitle.textContent = 'Contact Us';
        modalContent.innerHTML = `
            <div class="contact-options">
                <a href="mailto:support@footradapro.com" class="contact-option">
                    <i class="fas fa-envelope"></i>
                    <div>
                        <strong>Email Support</strong>
                        <small>support@footradapro.com</small>
                    </div>
                </a>
                <div class="contact-option" id="telegramOption">
                    <i class="fab fa-telegram"></i>
                    <div>
                        <strong>Telegram Community</strong>
                        <small>Join for instant help</small>
                    </div>
                </div>
                <div class="contact-option" id="twitterOption">
                    <i class="fab fa-twitter"></i>
                    <div>
                        <strong>Twitter / X</strong>
                        <small>Follow for updates</small>
                    </div>
                </div>
            </div>
        `;
        
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
        
        setTimeout(() => {
            const tg = document.getElementById('telegramOption');
            const tw = document.getElementById('twitterOption');
            if (tg) tg.onclick = () => window.open('https://t.me/footradapro', '_blank');
            if (tw) tw.onclick = () => window.open('https://twitter.com/footradapro', '_blank');
        }, 100);
        
        const closeModal = document.getElementById('closeModal');
        if (closeModal) {
            closeModal.onclick = () => this.closeModal();
        }
        window.onclick = (e) => {
            if (e.target === modal) this.closeModal();
        };
    }

    closeModal() {
        const modal = document.getElementById('faqModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.style.display = 'none', 300);
        }
    }

    createModal() {
        const modalHTML = `
            <div class="modal-overlay" id="faqModal">
                <div class="modal">
                    <div class="modal-header">
                        <h2 id="modalTitle">Title</h2>
                        <button class="modal-close" id="closeModal">&times;</button>
                    </div>
                    <div class="modal-body" id="modalContent"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.openContactModal();
    }

    // 弹窗嵌入客服页面（无额外头部，无滚动条，优化尺寸）
    openChatModal() {
        // 检查是否已存在弹窗
        let chatModal = document.getElementById('chatModal');
        if (chatModal) {
            chatModal.style.display = 'flex';
            return;
        }
        
        // 创建弹窗容器
        chatModal = document.createElement('div');
        chatModal.id = 'chatModal';
        chatModal.className = 'chat-modal-overlay';
        chatModal.innerHTML = `
            <div class="chat-modal-container" style="width: 480px; height: 680px;">
                <iframe src="/support-chat.html" class="chat-modal-iframe" title="Live Chat Support" scrolling="no"></iframe>
            </div>
        `;
        document.body.appendChild(chatModal);
        
        // 点击背景关闭
        chatModal.onclick = (e) => {
            if (e.target === chatModal) {
                chatModal.style.display = 'none';
            }
        };
        
        chatModal.style.display = 'flex';
    }

    initSearch() {
        // Search functionality removed
    }

    initTheme() {
        const themeBtn = document.getElementById('themeBtn');
        if (!themeBtn) return;
        
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.setAttribute('data-theme', 'light');
            themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
        }
        
        themeBtn.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme') || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            themeBtn.innerHTML = newTheme === 'dark' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.supportController = new SupportController();
});