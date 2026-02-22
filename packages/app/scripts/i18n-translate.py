#!/usr/bin/env python3
"""
Translate Chinese values in en.json to English.
Uses a domain-specific dictionary + pattern matching.
"""

import json
import re
from pathlib import Path

EN_JSON = Path(__file__).parent.parent / "src" / "i18n" / "messages" / "en.json"

# Domain-specific translation dictionary
TRANSLATIONS = {
    # Common UI
    "正在加载": "Loading",
    "加载中": "Loading",
    "加载中...": "Loading...",
    "暂无数据": "No data",
    "暂无记录": "No records",
    "稍后再来查看": "Check back later",
    "稍后刷新再看": "Refresh later",
    "提交": "Submit",
    "提交中...": "Submitting...",
    "确认": "Confirm",
    "取消": "Cancel",
    "返回": "Back",
    "保存": "Save",
    "删除": "Delete",
    "编辑": "Edit",
    "搜索": "Search",
    "刷新": "Refresh",
    "重试": "Retry",
    "关闭": "Close",
    "全部": "All",
    "更多": "More",
    "查看详情": "View details",
    "查看更多": "View more",
    "复制": "Copy",
    "已复制": "Copied",
    "复制成功": "Copied successfully",
    "操作成功": "Operation successful",
    "操作失败": "Operation failed",
    "请稍候": "Please wait",
    "请稍后再试": "Please try again later",
    "未知错误": "Unknown error",
    "网络错误": "Network error",
    "请求失败": "Request failed",
    "无权限": "No permission",
    "无权限访问": "No access permission",
    "暂无消息": "No messages",
    "暂无通知": "No notifications",
    "暂无评价": "No reviews",
    "暂无订单": "No orders",
    "暂无优惠券": "No coupons",
    "暂无争议记录": "No dispute records",
    "今天": "Today",
    "昨天": "Yesterday",
    "本周": "This week",
    "本月": "This month",
    "上月": "Last month",
    "最近7天": "Last 7 days",
    "最近30天": "Last 30 days",
    "开始日期": "Start date",
    "结束日期": "End date",
    "是": "Yes",
    "否": "No",
    "开启": "Enabled",
    "关闭": "Disabled",
    "启用": "Enable",
    "禁用": "Disable",
    "上传": "Upload",
    "下载": "Download",
    "导出": "Export",
    "导入": "Import",

    # Admin
    "权限加载中": "Loading permissions",
    "无权限访问该页面": "No permission to access this page",
    "请联系管理员调整权限": "Please contact admin to adjust permissions",
    "同步最新订单数据": "Syncing latest order data",
    "暂无订单记录": "No order records",
    "同步陪练状态": "Syncing companion status",
    "暂无陪练档案": "No companion profiles",
    "先去创建陪练资料": "Create companion profile first",
    "同步增长概览数据": "Syncing growth overview data",
    "同步转化漏斗": "Syncing conversion funnel",
    "暂未收集到漏斗数据": "No funnel data collected yet",
    "同步热门页面": "Syncing popular pages",
    "数据大屏": "Dashboard",
    "优惠卡券": "Coupons",
    "卡密兑换": "Redeem Code",
    "邀请返利": "Referral Rewards",
    "营收绩效": "Revenue & Performance",
    "完单收益": "Completion Earnings",
    "馒头提现": "Mantou Withdrawal",
    "发票申请": "Invoice Request",
    "订单对账": "Order Reconciliation",
    "支付事件": "Payment Events",
    "审计日志": "Audit Log",
    "支付对账": "Payment Reconciliation",

    # Orders
    "订单": "Order",
    "订单号": "Order ID",
    "订单详情": "Order Details",
    "订单状态": "Order Status",
    "订单金额": "Order Amount",
    "创建时间": "Created at",
    "更新时间": "Updated at",
    "已支付": "Paid",
    "待支付": "Pending Payment",
    "进行中": "In Progress",
    "已完成": "Completed",
    "已取消": "Cancelled",
    "已退款": "Refunded",
    "待结算": "Pending Settlement",
    "争议中": "In Dispute",
    "待接单": "Awaiting Acceptance",
    "已接单": "Accepted",
    "服务中": "In Service",
    "待确认": "Pending Confirmation",
    "创建订单": "Create Order",
    "创建订单失败": "Failed to create order",
    "下单成功": "Order placed successfully",
    "取消订单": "Cancel Order",
    "确认完成": "Confirm Completion",
    "发起争议": "File Dispute",
    "查看订单": "View Order",
    "返回订单列表": "Back to Orders",
    "订单创建成功": "Order created successfully",
    "快速下单": "Quick Order",
    "首单优惠": "First Order Discount",

    # Players/Companions
    "陪练": "Companion",
    "陪练师": "Coach",
    "在线": "Online",
    "离线": "Offline",
    "忙碌": "Busy",
    "接单中": "Taking Orders",
    "休息中": "On Break",
    "评分": "Rating",
    "接单量": "Orders Taken",
    "完成率": "Completion Rate",
    "好评率": "Positive Rate",
    "服务时长": "Service Duration",
    "擅长英雄": "Preferred Heroes",
    "段位": "Rank",
    "游戏ID": "Game ID",
    "联系方式": "Contact",
    "个人简介": "Bio",
    "陪练排班": "Companion Schedule",

    # User
    "我的": "My",
    "我的订单": "My Orders",
    "我的优惠券": "My Coupons",
    "我的争议": "My Disputes",
    "个人中心": "Profile",
    "消息中心": "Messages",
    "设置": "Settings",
    "退出登录": "Log Out",
    "登录": "Log In",
    "注册": "Sign Up",
    "钱包": "Wallet",
    "余额": "Balance",
    "充值": "Top Up",
    "提现": "Withdraw",
    "交易记录": "Transaction History",
    "会员": "VIP",
    "会员权益": "VIP Benefits",
    "专属加速": "Exclusive Boost",
    "联系客服": "Contact Support",
    "实时工单": "Live Ticket",
    "常见问题": "FAQ",
    "关于我们": "About Us",
    "用户协议": "Terms of Service",
    "隐私政策": "Privacy Policy",
    "版本更新": "Updates",
    "意见反馈": "Feedback",

    # Dispute
    "争议原因": "Dispute Reason",
    "详细描述": "Description",
    "争议已提交": "Dispute Submitted",
    "提交后将进入人工审核，通常 24 小时内处理完毕": "Your dispute will be reviewed manually, usually within 24 hours",
    "我们会在 24 小时内处理您的争议，请留意通知。": "We will process your dispute within 24 hours. Please check notifications.",
    "服务质量问题": "Service Quality Issue",
    "陪练未到": "Companion No-Show",
    "服务内容不符": "Service Mismatch",
    "多收费": "Overcharge",
    "其他": "Other",
    "待处理": "Pending",
    "审核中": "Under Review",
    "已驳回": "Rejected",
    "部分退款": "Partial Refund",

    # Schedule
    "预约": "Book",
    "选择时间": "Select Time",
    "选择陪练": "Select Companion",
    "确认预约": "Confirm Booking",
    "预约成功": "Booking Successful",
    "选择游戏": "Select Game",
    "选择套餐": "Select Package",
    "推荐": "Recommended",
    "小时单": "Hourly",
    "价格排序": "Sort by Price",
    "从低到高": "Low to High",
    "从高到低": "High to Low",

    # Pricing
    "价格": "Price",
    "原价": "Original Price",
    "优惠价": "Discounted Price",
    "折扣": "Discount",
    "免费": "Free",
    "元": "CNY",
    "元/小时": "CNY/hour",
    "元/局": "CNY/game",

    # Referral
    "邀请好友": "Invite Friends",
    "邀请码": "Referral Code",
    "邀请链接": "Referral Link",
    "已邀请": "Invited",
    "邀请奖励": "Referral Reward",
    "累计邀请": "Total Invites",
    "累计奖励": "Total Rewards",

    # Coupon
    "优惠券": "Coupon",
    "已使用": "Used",
    "已过期": "Expired",
    "未使用": "Unused",
    "立即使用": "Use Now",
    "有效期至": "Valid until",

    # Notification
    "通知": "Notification",
    "全部已读": "Mark All Read",
    "订单状态更新": "Order Status Update",
    "系统通知": "System Notification",

    # Growth/Level
    "等级": "Level",
    "经验值": "Experience",
    "积分": "Points",
    "签到": "Check In",
    "今日已签到": "Checked In Today",
    "连续签到": "Consecutive Check-ins",
    "每日签到": "Daily Check-in",

    # Chain/Blockchain
    "链上订单": "On-chain Order",
    "链上状态": "Chain Status",
    "链上确认": "Chain Confirmation",
    "交易哈希": "Transaction Hash",
    "钱包地址": "Wallet Address",
    "连接钱包": "Connect Wallet",
    "断开连接": "Disconnect",

    # Misc
    "首页": "Home",
    "发现": "Discover",
    "动态": "News",
    "展示": "Showcase",
    "赛事": "Events",
    "战绩": "Match History",
    "排行榜": "Leaderboard",
    "公告": "Announcements",
    "活动": "Events",
    "分享": "Share",
    "收藏": "Favorite",
    "点赞": "Like",
    "评论": "Comment",
    "举报": "Report",
    "拉黑": "Block",
    "男": "Male",
    "女": "Female",
    "秒": "seconds",
    "分钟": "minutes",
    "小时": "hours",
    "天": "days",
    "周": "weeks",
    "月": "months",
    "年": "years",
    "暂无更多": "No more",
    "加载更多": "Load more",
    "下拉刷新": "Pull to refresh",
    "释放刷新": "Release to refresh",
    "刷新成功": "Refreshed",
    "刷新失败": "Refresh failed",
}

# Pattern-based translations
PATTERNS = [
    (re.compile(r'^同步(.+)数据$'), lambda m: f"Syncing {m.group(1)} data"),
    (re.compile(r'^暂无(.+)$'), lambda m: f"No {m.group(1)}"),
    (re.compile(r'^请输入(.+)$'), lambda m: f"Enter {m.group(1)}"),
    (re.compile(r'^请选择(.+)$'), lambda m: f"Select {m.group(1)}"),
    (re.compile(r'^确认(.+)$'), lambda m: f"Confirm {m.group(1)}"),
    (re.compile(r'^(.+)失败$'), lambda m: f"{m.group(1)} failed"),
    (re.compile(r'^(.+)成功$'), lambda m: f"{m.group(1)} successful"),
    (re.compile(r'^(.+)中$'), lambda m: f"{m.group(1)} in progress"),
    (re.compile(r'^共\s*(\d+)\s*条$'), lambda m: f"Total {m.group(1)} items"),
]

CN_CHAR = re.compile(r'[\u4e00-\u9fff]')

def translate(text: str) -> str | None:
    """Try to translate Chinese text to English."""
    # Exact match
    if text in TRANSLATIONS:
        return TRANSLATIONS[text]
    
    # Pattern match
    for pattern, handler in PATTERNS:
        m = pattern.match(text)
        if m:
            return handler(m)
    
    return None

def main():
    with open(EN_JSON) as f:
        data = json.load(f)
    
    translated = 0
    remaining = 0
    remaining_samples = []
    
    for key in list(data.keys()):
        val = data[key]
        if not isinstance(val, str):
            continue
        if not CN_CHAR.search(val):
            continue
        
        eng = translate(val)
        if eng:
            data[key] = eng
            translated += 1
        else:
            remaining += 1
            if len(remaining_samples) < 30:
                remaining_samples.append((key, val))
    
    with open(EN_JSON, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    
    print(f"Translated: {translated}")
    print(f"Remaining Chinese: {remaining}")
    if remaining_samples:
        print("\nSamples of untranslated:")
        for k, v in remaining_samples[:15]:
            print(f"  {k}: {v}")

if __name__ == '__main__':
    main()
