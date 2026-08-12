/**
 * Welcome to Cloudflare Workers!
 */

// export default {
//   async fetch(request, env, ctx) {
//     await fetchAndStoreNews(env)
//     return new Response('Hello World!');
//   }
// };

// async function fetchAndStoreNews(env) {
//   // 从环境变量中获取配置
//   const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
//   const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
//   const newsApiKey = env.NEXT_PUBLIC_NEWs_key;
//   const table_name=env.TABLE_NAME;
//   const news_url=env.NEWS_URL
//   // 1. 从 NewsAPI 获取数据

//   let newsRes;
//   try {
//     newsRes = await fetch(`https://newsapi.org/v2/top-headlines?${news_url}&apiKey=${newsApiKey}`,
//       {
//         headers: {
//           'User-Agent': 'MyNewsFetcher/1.0 (https://gekaixing.vercel.app)',
//         },
//       });

//   } catch (err) {
//     console.error("🔥 fetch 请求失败了:", err);
//     return;
//   }
//   if (!newsRes.ok) {
//     console.error(`NewsAPI fetch failed: ${newsRes.statusText}`);
//     return;
//   }

//   const { articles } = await newsRes.json();
//   console.log(articles)
//   if (!articles || articles.length === 0) {
//     console.log("No articles found from NewsAPI.");
//     return;
//   }



//   // 3. 构建插入 Supabase 的数据
//   const newsData = articles.map((article) => ({
//     title: article.title,
//     url: article.url,
//     publishedAt: article.publishedAt,
//     source_id: article.source?.id,
//     source_name: article.source?.name,
//     content: article.content,
//     description: article.description,
//     author: article.author,
//     urlToImage: article.urlToImage,
//   }));
//   console.log(newsData)
//   // 4. 将数据批量插入 Supabase
//   try {
//     const response = await fetch(`${supabaseUrl}/rest/v1/${table_name}`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'apikey': supabaseKey,
//       },
//       body: JSON.stringify(newsData),
//     });
//     const data = await response.json()
//     console.log(data)
//     if (!response.ok) {
//       const errorText = await response.text();
//       throw new Error(`Supabase insert failed: ${errorText}`);
//     }

//     console.log("Supabase insert successful!");

//   } catch (error) {
//     console.error("Supabase API error:", error);
//   }
// }