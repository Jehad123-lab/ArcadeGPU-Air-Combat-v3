/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState, useRef } from 'react';
import { em } from '@lib/engine/engine_manager';
import { screenManager } from '@lib/screen/screen_manager';
import { inputManager } from '@lib/input/input_manager';
import { motion, AnimatePresence } from 'framer-motion';

// --- SCREEN ---

import { GameScreen } from './game/GameScreen';

// --- UI COMPONENTS ---

const Joystick = ({ onChange }: { onChange: (dir: { x: number, y: number }) => void }) => {
    const [dragging, setDragging] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
            e.nativeEvent.stopImmediatePropagation();
        }
        setDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragging || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        let dx = e.clientX - centerX;
        let dy = e.clientY - centerY;
        
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = rect.width / 2;
        
        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }
        
        setPos({ x: dx, y: dy });
        onChange({ x: dx / maxDist, y: dy / maxDist });
    };

    const handlePointerUp = () => {
        setDragging(false);
        setPos({ x: 0, y: 0 });
        onChange({ x: 0, y: 0 });
    };

    return (
        <div 
            ref={containerRef}
            className="w-32 h-32 rounded-full border-4 border-white/20 bg-white/5 flex items-center justify-center relative touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            <motion.div 
                className="w-12 h-12 rounded-full bg-white shadow-xl pointer-events-none"
                animate={{ x: pos.x, y: pos.y }}
                transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            />
        </div>
    );
};

const ScoreDisplay = ({ gameRef }: { gameRef: React.MutableRefObject<GameScreen | null> }) => {
    const [score, setScore] = useState(0);
    
    useEffect(() => {
        const interval = setInterval(() => {
            if (gameRef.current && gameRef.current.enemyManager) {
                setScore(gameRef.current.enemyManager.score);
            }
        }, 100);
        return () => clearInterval(interval);
    }, [gameRef]);
    
    return (
        <div className="text-white text-5xl font-bebas drop-shadow-md">
            {score.toString().padStart(5, '0')}
        </div>
    );
};

const HealthBar = ({ gameRef }: { gameRef: React.MutableRefObject<GameScreen | null> }) => {
    const [health, setHealth] = useState(100);
    
    useEffect(() => {
        const interval = setInterval(() => {
            if (gameRef.current && gameRef.current.plane) {
                setHealth(gameRef.current.plane.health);
            }
        }, 50);
        return () => clearInterval(interval);
    }, [gameRef]);
    
    return (
        <div className="flex flex-col gap-1 w-64">
            <div className="flex justify-between items-end">
                <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Structural Integrity</span>
                <span className="text-white text-sm font-mono">{Math.round(health)}%</span>
            </div>
            <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 backdrop-blur-sm">
                <motion.div 
                    className="h-full bg-gradient-to-r from-red-600 via-red-500 to-red-400"
                    initial={{ width: '100%' }}
                    animate={{ width: `${health}%` }}
                    transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                    style={{
                        boxShadow: health < 30 ? '0 0 12px rgba(239, 68, 68, 0.6)' : 'none'
                    }}
                />
            </div>
            {health < 30 && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="text-red-500 text-[9px] font-bold uppercase tracking-[0.2em] mt-1"
                >
                    Critical Damage Warning
                </motion.div>
            )}
        </div>
    );
};

const VirtualJoystickDisplay = ({ gameRef }: { gameRef: React.MutableRefObject<GameScreen | null> }) => {
    const [vx, setVx] = useState(0);
    const [vy, setVy] = useState(0);
    
    useEffect(() => {
        let frame: number;
        const loop = () => {
            if (gameRef.current) {
                setVx(gameRef.current.virtualMouseX);
                setVy(gameRef.current.virtualMouseY);
            }
            frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frame);
    }, [gameRef]);
    
    return (
        <div 
            className="absolute rounded-full border border-white/60 shadow-[0_0_8px_rgba(255,255,255,0.4)] w-[16px] h-[16px] pointer-events-none transition-transform duration-75 mix-blend-difference"
            style={{
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${vx * 150}px), calc(-50% + ${vy * 150}px))`
            }}
        />
    );
};

// --- APP COMPONENT ---

const App = () => {
    const [isReady, setIsReady] = useState(false);
    const gameScreenRef = useRef<GameScreen | null>(null);

    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };
        document.addEventListener('contextmenu', handleContextMenu);

        const init = async () => {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const screen = new GameScreen();
            gameScreenRef.current = screen;
            screenManager.requestSetScreen(screen);
            
            await screen.onEnter();
            
            em.startup(false);
            setIsReady(true);
        };

        init();

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            em.pause();
        };
    }, []);

    const handleJoystickChange = (dir: { x: number, y: number }) => {
        if (gameScreenRef.current) {
            if (inputManager.isPointerLockCaptured()) return;
            gameScreenRef.current.moveDir = dir;
        }
    };

    useEffect(() => {
        const hookId = setInterval(() => {
            if (gameScreenRef.current && gameScreenRef.current.moveDir) {
                if (!inputManager.isPointerLockCaptured()) {
                    const r = gameScreenRef.current.moveDir.x;
                    const p = gameScreenRef.current.moveDir.y;
                    
                    gameScreenRef.current.plane.roll -= r * 3.0 * (16/1000); // 60fps
                    gameScreenRef.current.plane.pitch -= p * 2.0 * (16/1000);
                }
            }
        }, 16);
        return () => clearInterval(hookId);
    }, []);

    return (
        <div className="fixed inset-0 w-full h-full pointer-events-none flex flex-col justify-end p-8 overflow-hidden font-sans">
            <AnimatePresence>
                {!isReady && (
                    <motion.div 
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900 flex items-center justify-center z-50 pointer-events-auto"
                    >
                        <div className="text-white text-2xl font-bebas tracking-widest animate-pulse">
                            INITIALIZING AIR COMBAT...
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="absolute top-8 left-8 pointer-events-auto">
                <h1 className="text-4xl font-bebas text-white drop-shadow-lg tracking-wider">AIR COMBAT</h1>
                <div className="bg-black/20 backdrop-blur-sm p-3 rounded-lg border border-white/5 mt-2">
                    <p className="text-white/80 text-xs font-bold uppercase tracking-tighter mb-1">Controls</p>
                    <p className="text-white/60 text-[11px] font-mono leading-tight">W/S • THROTTLE</p>
                    <p className="text-white/60 text-[11px] font-mono leading-tight">A/D • ROLL</p>
                    <p className="text-white/60 text-[11px] font-mono leading-tight">Q/E • YAW</p>
                    <p className="text-white/60 text-[11px] font-mono leading-tight">SPACE / LClick • FIRE</p>
                    <p className="text-white/60 text-[11px] font-mono leading-tight">SHIFT • BARREL ROLL</p>
                </div>
            </div>
            
            <div className="absolute top-8 right-8 pointer-events-none flex flex-col items-end gap-4">
                <div className="bg-emerald-500/20 backdrop-blur-md px-6 py-4 rounded-xl border border-emerald-500/30 text-right">
                    <div className="text-emerald-400 text-sm font-bold uppercase tracking-widest mb-1">SCORE</div>
                    <ScoreDisplay gameRef={gameScreenRef} />
                </div>
                
                <div className="bg-black/30 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10">
                    <HealthBar gameRef={gameScreenRef} />
                </div>
            </div>

            {/* HUD Crosshair */}
            <div className="fixed inset-0 pointer-events-none flex items-center justify-center mix-blend-screen opacity-70">
               <div className="absolute w-[40px] h-[2px] bg-emerald-400 rounded shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
               <div className="absolute w-[2px] h-[40px] bg-emerald-400 rounded shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
               <div className="absolute w-[60px] h-[60px] rounded-full border-2 border-emerald-400/50"></div>
               <VirtualJoystickDisplay gameRef={gameScreenRef} />
            </div>

            <div className="pointer-events-auto flex justify-between items-end w-full pb-8">
                <Joystick onChange={handleJoystickChange} />
                
                <div className="flex flex-col items-end gap-2">
                    <div className="text-white/40 text-xs font-mono uppercase mt-4">Version 0.3.0-Flight</div>
                </div>
            </div>

            <style>{`
                canvas {
                    image-rendering: auto;
                }
            `}</style>
        </div>
    );
};

export default App;
