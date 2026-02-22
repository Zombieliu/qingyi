#!/usr/bin/env python3
"""
Comprehensive Chinese→English translation for en.json.
Handles exact matches, patterns, and word-level substitution.
"""

import json
import re
from pathlib import Path

EN_JSON = Path(__file__).parent.parent / "src" / "i18n" / "messages" / "en.json"
CN_CHAR = re.compile(r'[\u4e00-\u9fff]')

# Comprehensive exact translations
EXACT = {
    # Single words
    "指南": "Guide", "押金": "Deposit", "馒头": "Mantou", "特权": "Privileges",
    "用户": "User", "资讯": "News", "次数": "Count", "时间": "Time",
    "标题": "Title", "名称": "Name", "用尽": "Exhausted", "失败": "Failed",
    "实时": "Real-time", "状态": "Status", "进入": "Enter", "奖励": "Reward",
    "备注": "Notes", "经验": "Experience", "总量": "Total", "更新": "Update",
    "不限": "Unlimited", "派单": "Dispatch", "批次": "Batch", "金额": "Amount",
    "完成": "Complete", "目标": "Target", "降序": "Descending", "停用": "Disabled",
    "选择": "Select", "称呼": "Name", "总榜": "Overall", "过期": "Expired",
    "卡密": "Redeem Code", "数量": "Quantity", "钻石": "Diamond", "页面": "Page",
    "应付": "Payable", "上架": "Listed", "内容": "Content", "角色": "Role",
    "主题": "Theme", "匿名": "Anonymous", "默认": "Default", "事件": "Event",
    "营收": "Revenue", "位置": "Position", "校验": "Verify", "可用": "Available",
    "操作": "Action", "升序": "Ascending", "类型": "Type", "来源": "Source",
    "比例": "Ratio", "总计": "Total", "详情": "Details", "记录": "Records",
    "配置": "Config", "地址": "Address", "手机": "Phone", "昵称": "Nickname",
    "头像": "Avatar", "性别": "Gender", "生日": "Birthday", "签名": "Signature",
    "邮箱": "Email", "密码": "Password", "验证码": "Verification Code",

    # Days of week
    "周一": "Mon", "周二": "Tue", "周三": "Wed", "周四": "Thu",
    "周五": "Fri", "周六": "Sat", "周日": "Sun",

    # Stars
    "1星": "1 Star", "2星": "2 Stars", "3星": "3 Stars", "4星": "4 Stars", "5星": "5 Stars",

    # Admin domain
    "同步事件排行": "Syncing event rankings",
    "只读权限": "Read-only permission",
    "当前账号无法编辑公告内容": "Current account cannot edit announcements",
    "正在同步公告列表": "Syncing announcement list",
    "发布第一条公告吧": "Publish your first announcement",
    "显示缓存数据，正在刷新…": "Showing cached data, refreshing...",
    "正在同步审计日志": "Syncing audit logs",
    "暂时没有可展示的日志": "No logs to display",
    "交易 digest": "Transaction digest",
    "按 digest 补单": "Create order by digest",
    "执行超期取消": "Execute overdue cancellation",
    "正在同步争议订单": "Syncing disputed orders",
    "目前没有待处理争议": "No pending disputes",
    "正在同步链上订单": "Syncing on-chain orders",
    "强制取消": "Force Cancel",
    "清理缺链订单": "Clean up missing chain orders",
    "正在对账链上/本地订单": "Reconciling on-chain/local orders",
    "正在汇总完单数据": "Aggregating completion data",
    "调整筛选条件后再试": "Adjust filters and try again",
    "完单数": "Completions",
    "平台撮合费": "Platform Fee",
    "最近完单": "Recent Completions",
    "导出范围": "Export Range",
    "当前没有待处理的申请": "No pending applications",
    "复制完整地址": "Copy full address",
    "复制钱包地址": "Copy wallet address",
    "网络异常，请稍后再试": "Network error, please try again later",
    "目前没有待处理的提现": "No pending withdrawals",
    "没有符合条件的订单": "No matching orders",
    "调整筛选条件试试": "Try adjusting filters",
    "正在同步支付事件": "Syncing payment events",
    "目前没有支付记录": "No payment records",
    "请填写钱包地址": "Please enter wallet address",
    "请填写手机号": "Please enter phone number",
    "钱包地址格式不正确": "Invalid wallet address format",
    "手机号格式不正确": "Invalid phone number format",
    "钱包地址已绑定其他陪练": "Wallet address already bound to another companion",
    "11位手机号": "11-digit phone number",
    "Sui 地址（0x...）": "Sui address (0x...)",
    "当前账号无法新增或编辑陪练": "Current account cannot add or edit companions",
    "正在同步陪练档案": "Syncing companion profiles",
    "可以先创建陪练资料": "Create a companion profile first",
    "创建失败，请稍后再试": "Creation failed, please try again",
    "复制失败，请稍后再试": "Copy failed, please try again",
    "例如：春节礼包": "e.g. Spring Festival Pack",
    "可选，给运营备注": "Optional, notes for operations",
    "输入数量": "Enter quantity",
    "输入天数": "Enter days",
    "可选，留空则取默认等级": "Optional, leave empty for default level",
    "默认 10": "Default 10",
    "默认 1": "Default 1",
    "每行一个卡密或使用空格分隔": "One code per line or space-separated",
    "搜索卡密或批次": "Search codes or batches",
    "保存配置": "Save Config",
    "搜索地址": "Search address",
    "用户通过邀请链接注册后会显示在这里": "Users who register via referral link will appear here",
    "邀请人": "Referrer",
    "被邀请人": "Invitee",
    "待返利": "Pending Reward",
    "邀请人奖励": "Referrer Reward",
    "被邀请人奖励": "Invitee Reward",
    "正在同步客服工单": "Syncing support tickets",
    "目前没有待处理工单": "No pending tickets",
    "正在同步代币配置": "Syncing token config",
    "正在同步会员等级": "Syncing VIP tiers",
    "可以创建新的会员等级": "Create a new VIP tier",
    "等级名称": "Tier Name",
    "最低积分": "Min Points",
    "折扣比例": "Discount Rate",
    "积分倍率": "Points Multiplier",
    "专属标识": "Badge",
    "创建等级": "Create Tier",
    "编辑等级": "Edit Tier",
    "删除等级": "Delete Tier",

    # Home page
    "30 秒开局": "30s to Start",
    "满 99 减 10": "¥10 off on ¥99+",
    "绝密体验单": "Secret Trial Order",
    "15 分钟上车": "15min Quick Start",
    "热门陪练": "Popular Companions",
    "最新动态": "Latest News",
    "精选套餐": "Featured Packages",
    "限时优惠": "Limited Offer",
    "新人专享": "New User Exclusive",
    "热门游戏": "Popular Games",
    "三角洲行动": "Delta Force",
    "王者荣耀": "Honor of Kings",
    "英雄联盟": "League of Legends",
    "和平精英": "Game for Peace",
    "永劫无间": "Naraka: Bladepoint",

    # Me section
    "订单中心": "Order Center",
    "待开始": "Pending Start",
    "待确认完成": "Pending Confirmation",
    "查看全部": "View All",
    "邀请好友赚积分": "Invite friends to earn points",
    "复制邀请链接": "Copy referral link",
    "我的邀请": "My Referrals",
    "邀请记录": "Referral History",
    "累计获得积分": "Total Points Earned",
    "成功邀请人数": "Successful Invites",
    "分享给好友": "Share with friends",

    # Wallet
    "可用余额": "Available Balance",
    "充值记录": "Top-up History",
    "提现记录": "Withdrawal History",
    "交易明细": "Transaction Details",
    "收入": "Income",
    "支出": "Expense",
    "转账": "Transfer",

    # Companion portal
    "陪练中心": "Companion Center",
    "我的排班": "My Schedule",
    "今日订单": "Today's Orders",
    "本月收入": "Monthly Income",
    "接单设置": "Order Settings",
    "服务项目": "Services",
    "价格设置": "Pricing",
    "个人资料": "Profile",
    "数据统计": "Statistics",
    "客户评价": "Customer Reviews",
    "收益明细": "Earnings Details",

    # FAQ
    "如何下单": "How to Order",
    "如何支付": "How to Pay",
    "如何退款": "How to Refund",
    "如何联系客服": "How to Contact Support",
    "如何成为陪练": "How to Become a Companion",
    "如何提现": "How to Withdraw",
    "如何使用优惠券": "How to Use Coupons",
    "如何邀请好友": "How to Invite Friends",

    # Showcase
    "精彩瞬间": "Highlights",
    "战绩展示": "Match Records",
    "陪练风采": "Companion Gallery",
    "用户评价": "User Reviews",
    "好评如潮": "Rave Reviews",

    # Error messages
    "请先登录": "Please log in first",
    "登录已过期": "Login expired",
    "请重新登录": "Please log in again",
    "参数错误": "Invalid parameters",
    "服务器错误": "Server error",
    "系统繁忙": "System busy",
    "功能暂未开放": "Feature not available yet",
    "争议功能暂未开放": "Dispute feature not available yet",
    "订单不存在": "Order not found",
    "无权操作此订单": "No permission for this order",
    "当前订单状态不支持发起争议": "Current order status does not support disputes",

    # Reconcile page
    "检查中...": "Checking...",
    "开始对账": "Start Reconcile",
    "修复中...": "Fixing...",
    "自动修复": "Auto Fix",
    "检查订单": "Orders Checked",
    "一致": "Matched",
    "不一致": "Mismatched",
    "不一致项": "Mismatched Items",
    "本地状态": "Local Status",
    "链上状态": "Chain Status",
    "支付状态": "Payment Status",
    "问题": "Issue",
    "全部一致": "All Matched",
    "生成时间": "Generated at",
    "检查范围": "Check Range",
    "最近 1 天": "Last 1 day",
    "最近 3 天": "Last 3 days",
    "最近 7 天": "Last 7 days",
    "最近 14 天": "Last 14 days",
    "最近 30 天": "Last 30 days",

    # Mixed Chinese/English patterns (from partial migration)
    "加载优惠券 in progress": "Loading coupons",
    "正在同步最新优惠券": "Syncing latest coupons",
    "可以新建优惠券": "Create a new coupon",
    "加载陪练申请 in progress": "Loading companion applications",
    "正在同步最新申请": "Syncing latest applications",
    "加载发票申请 in progress": "Loading invoice applications",
    "正在同步最新发票申请": "Syncing latest invoice applications",
    "记账 successful": "Ledger entry successful",
    "记账 failed": "Ledger entry failed",
    "加载提现申请 in progress": "Loading withdrawal applications",
    "正在同步最新提现记录": "Syncing latest withdrawal records",
    "Confirm 清理所有 E2E 测试订单？": "Confirm clean up all E2E test orders?",
    "清理 E2E": "Clean E2E",
    "加载订单 in progress": "Loading orders",
    "正在同步最新订单列表": "Syncing latest order list",
    "加载配置 in progress": "Loading config",
    "加载邀请记录 in progress": "Loading referral records",
    "例如：兑换 successful": "e.g. Redeemed successfully",
    "可选，例如 QY": "Optional, e.g. QY",
    "Enter 批次标题": "Enter batch title",
    "Enter 有效的奖励数量": "Enter valid reward quantity",
    "Enter 有效的会员天数": "Enter valid VIP days",
    "Enter 优惠券 ID 或兑换码": "Enter coupon ID or redeem code",
    "No 热门页面记录": "No popular page records",
    "No 事件排行记录": "No event ranking records",
    "No 公告记录": "No announcement records",
    "No 审计记录": "No audit records",
    "No 争议订单": "No disputed orders",
    "No 链上订单记录": "No on-chain order records",
    "No 卡密": "No redeem codes",
    "No 兑换记录": "No redemption records",
    "No 邀请记录": "No referral records",
    "No 陪练申请": "No companion applications",
    "No 发票申请": "No invoice applications",
    "No 提现申请": "No withdrawal applications",
    "No 支付事件": "No payment events",
    "No 客服工单": "No support tickets",
}

# Word-level substitution for remaining strings
WORD_MAP = {
    "正在同步": "Syncing",
    "正在加载": "Loading",
    "正在": "Processing",
    "暂无": "No",
    "请输入": "Enter",
    "请选择": "Select",
    "请填写": "Please enter",
    "确认": "Confirm",
    "取消": "Cancel",
    "删除": "Delete",
    "编辑": "Edit",
    "新增": "Add",
    "创建": "Create",
    "修改": "Modify",
    "保存": "Save",
    "提交": "Submit",
    "搜索": "Search",
    "筛选": "Filter",
    "排序": "Sort",
    "导出": "Export",
    "导入": "Import",
    "刷新": "Refresh",
    "同步": "Sync",
    "加载": "Load",
    "上传": "Upload",
    "下载": "Download",
    "复制": "Copy",
    "粘贴": "Paste",
    "分享": "Share",
    "收藏": "Favorite",
    "关注": "Follow",
    "取关": "Unfollow",
    "拉黑": "Block",
    "举报": "Report",
    "回复": "Reply",
    "评论": "Comment",
    "点赞": "Like",
    "订单": "order",
    "陪练": "companion",
    "用户": "user",
    "会员": "VIP",
    "优惠券": "coupon",
    "积分": "points",
    "余额": "balance",
    "钱包": "wallet",
    "地址": "address",
    "手机号": "phone",
    "邮箱": "email",
    "密码": "password",
    "昵称": "nickname",
    "头像": "avatar",
    "签名": "signature",
    "等级": "level",
    "经验": "experience",
    "成功": "successful",
    "失败": "failed",
    "错误": "error",
    "警告": "warning",
    "提示": "notice",
    "通知": "notification",
    "消息": "message",
    "公告": "announcement",
    "活动": "event",
    "任务": "task",
    "奖励": "reward",
    "记录": "records",
    "列表": "list",
    "详情": "details",
    "设置": "settings",
    "配置": "config",
    "管理": "manage",
    "审核": "review",
    "审计": "audit",
    "日志": "log",
    "数据": "data",
    "统计": "statistics",
    "分析": "analytics",
    "报表": "report",
    "图表": "chart",
    "趋势": "trend",
    "排行": "ranking",
    "榜单": "leaderboard",
    "对账": "reconcile",
    "结算": "settle",
    "退款": "refund",
    "支付": "payment",
    "充值": "top-up",
    "提现": "withdrawal",
    "转账": "transfer",
    "收入": "income",
    "支出": "expense",
    "费用": "fee",
    "佣金": "commission",
    "服务费": "service fee",
    "手续费": "handling fee",
    "链上": "on-chain",
    "争议": "dispute",
    "工单": "ticket",
    "客服": "support",
    "反馈": "feedback",
    "评价": "review",
    "评分": "rating",
    "好评": "positive",
    "差评": "negative",
    "中评": "neutral",
    "标签": "tag",
    "分类": "category",
    "类型": "type",
    "状态": "status",
    "来源": "source",
    "渠道": "channel",
    "平台": "platform",
    "系统": "system",
    "权限": "permission",
    "角色": "role",
    "管理员": "admin",
    "运营": "operator",
    "财务": "finance",
    "游戏": "game",
    "英雄": "hero",
    "段位": "rank",
    "赛季": "season",
    "战绩": "match history",
    "胜率": "win rate",
    "排班": "schedule",
    "接单": "accept order",
    "在线": "online",
    "离线": "offline",
    "忙碌": "busy",
    "空闲": "available",
    "休息": "break",
    "申请": "application",
    "审批": "approval",
    "通过": "approved",
    "拒绝": "rejected",
    "待处理": "pending",
    "处理中": "processing",
    "已处理": "processed",
    "已完成": "completed",
    "已取消": "cancelled",
    "已退款": "refunded",
    "已过期": "expired",
    "已使用": "used",
    "未使用": "unused",
    "已读": "read",
    "未读": "unread",
    "启用": "enabled",
    "禁用": "disabled",
    "开启": "on",
    "关闭": "off",
    "显示": "show",
    "隐藏": "hide",
    "展开": "expand",
    "收起": "collapse",
    "全部": "all",
    "部分": "partial",
    "无": "none",
    "有": "yes",
    "是": "yes",
    "否": "no",
    "男": "male",
    "女": "female",
    "天": "days",
    "小时": "hours",
    "分钟": "minutes",
    "秒": "seconds",
    "条": "items",
    "个": "",
    "位": "",
    "张": "",
    "份": "",
    "次": "times",
    "元": "CNY",
    "折": "% off",
    "发票": "invoice",
    "提现": "withdrawal",
    "馒头": "mantou",
    "卡密": "redeem code",
    "兑换": "redeem",
    "批次": "batch",
    "代币": "token",
    "钻石": "diamond",
    "金币": "gold",
    "银币": "silver",
    "铜币": "bronze",
}

def translate(text: str) -> str:
    """Translate Chinese text to English."""
    # Exact match first
    if text in EXACT:
        return EXACT[text]
    
    # Word-level substitution
    result = text
    for cn, en in sorted(WORD_MAP.items(), key=lambda x: -len(x[0])):
        result = result.replace(cn, en)
    
    # If still has Chinese, return None
    if CN_CHAR.search(result):
        return result  # Partially translated is better than nothing
    
    return result.strip()

def main():
    with open(EN_JSON) as f:
        data = json.load(f)
    
    translated = 0
    partial = 0
    remaining = 0
    
    for key in list(data.keys()):
        val = data[key]
        if not isinstance(val, str) or not CN_CHAR.search(val):
            continue
        
        eng = translate(val)
        if not CN_CHAR.search(eng):
            data[key] = eng
            translated += 1
        elif eng != val:
            data[key] = eng
            partial += 1
        else:
            remaining += 1
    
    with open(EN_JSON, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    
    print(f"Fully translated: {translated}")
    print(f"Partially translated: {partial}")
    print(f"Remaining Chinese: {remaining}")
    
    # Show remaining
    remaining_items = [(k, v) for k, v in data.items() if isinstance(v, str) and CN_CHAR.search(v)]
    if remaining_items:
        print(f"\nRemaining samples ({len(remaining_items)} total):")
        for k, v in remaining_items[:20]:
            print(f"  {k}: {v}")

if __name__ == '__main__':
    main()
