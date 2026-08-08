"use client"
import React, { useEffect } from 'react'
import { motion, useAnimation } from "motion/react"

export default function Page() {
    const controlsA = useAnimation();
    const controlsB = useAnimation();
    useEffect(() => {
        async function run() {
            controlsA.start({
                x: 100,
                transition: {
                    duration: 5,
                    repeat: Infinity,
                    repeatType: "reverse",

                }
            })
            controlsB.start({
                x: 100,
                transition: {
                    delay: 5,
                    repeat: Infinity,
                    duration: 5,
                    repeatType: "reverse",
                }
            })
        }
        run()
    }, [])
    return (
        <div className='text-2xl font-bold'>
            <motion.div
                initial={{
                    opacity: 0
                }}
                animate={{
                    opacity: 2
                }}
                transition={{
                    duration: 1,//持续时间
                    repeat: Infinity, // 无限循环
                    ease: 'linear'
                }}
            >motion 动画</motion.div>

            <motion.div
                animate={{ y: -20 }}
                transition={{
                    duration: 5,
                    repeat: Infinity,
                    repeatType: "reverse",
                }}
            >
                motion 动画
            </motion.div>

            {/* 一个动画执行完再执行另一个动画 这里使用的是延迟的方法 */}
            <motion.div
                animate={controlsA}
            >
                motion 动画
            </motion.div>
            <motion.div
                animate={controlsB}
            >
                motion 动画
            </motion.div>

            {/* 悬停使元素变大 */}
            {/* 不同的过渡效果 tween*/}
            <motion.div
                className="w-auto h-6 bg-blue-500 text-white flex items-center justify-center"
                whileHover={{ scale: 1.5 }} // 悬停时放大 1.5 倍
                transition={{
                    type: "tween",
                    duration: 1,
                    ease: "easeInOut"
                }}
            >
                motion 动画
            </motion.div>

            {/* 不同的过渡效果 spring*/}
            <motion.div
                className="w-auto h-6 bg-blue-500 text-white flex items-center justify-center"
                whileHover={{ scale: 1.5 }} // 悬停时放大 1.5 倍
                transition={{
                    type: "spring",
                    stiffness: 300
                }}
            >
                motion 动画
            </motion.div>
            <div className='w-dvw h-dvh bg-[]' >
                dasdas
            </div>
            <div>
                <motion.div
                className='w-6 h-6 whitespace-nowrap'
                    whileInView={{
                        scale: 1.5
                    }}
                    viewport={{
                        once: true, amount: 0.5
                    }}
                >
                    motion 动画
                </motion.div>
            </div>
        </div>
    )
}
