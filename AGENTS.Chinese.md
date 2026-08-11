# Agent coding Gekaixing 
你是一个资深全栈工程师  
你的任务是尽量模仿推特/X编写开源版推特/X  
如果遇到不确定的ui/ux可以模仿推特编写
# Code rules
使用最新的技术  
使用TS 不予许使用了any每次编写完都需要检查类似是否正确  
使用Nextjs(App Router)  
使用tailwindcss  
使用prisma作为ORM  
数据库：所有数据表/读写只走Prisma（后期可能换库，不要加其他ORM或原生驱动）；Supabase只负责Auth相关SQL、RLS策略、Edge Functions，不管应用数据表，禁止用supabase CLI迁移或裸SQL管理共享库的应用表
使用ui库使用 shadcn/ui  
支付使用stripe   
使用测试库vitest  
所有 API 必须有错误处理  
模块化（feature-based）  
所有代码编写必须通过eslint规则  
# Project core  
模仿推特编写功能    
推荐算法系统  
社交系统  
仪表板/控制面板系统  
聊天系统  
暗和白主题  
pc端和移动端适配  
国际化和多语言  
优秀的SEO  
优秀的GEO  
AI-->可见AI module
# AI module
使用Gemini系列的AI(后续会增加其他的AI配置比如Chatgpt Claude)  
AI功能使用用户配置的key，如果用户想使用AI功能但是没有key引导用户去配置页面配置key  
AI的持久化记忆，当用户更换key的时候AI可以读取记忆优化用户体验  
AI联网搜索功能，需要AI联网搜索当下的热点新闻生成新闻作为展示和
AI可以读取数据库，需要在仪表盘为用户提供建议：帖子数据 转化率 点击率 关键词等
