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
        <span className="text-white text-[10px] font-mono leading-none ml-auto">{score.toString().padStart(5, '0')}</span>
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
        <div className="bg-slate-800/80 p-[4px] px-[6px] rounded flex items-center border border-slate-700 w-[240px]">
            <span className="text-white/80 text-[10px] font-mono mr-2 leading-none whitespace-nowrap">ARMOR_INTEGRITY</span>
            <div className="flex-1 h-[8px] bg-slate-900 mx-2 relative overflow-hidden">
                <motion.div 
                    className="absolute top-0 left-0 bottom-0 bg-[#A0C5A0]"
                    animate={{ width: `${health}%` }}
                    transition={{ type: 'tween', duration: 0.1 }}
                />
            </div>
            <span className="text-white text-[10px] font-mono leading-none font-bold">{Math.round(health)}%</span>
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
        <div className="fixed inset-0 w-full h-full pointer-events-none flex flex-col font-mono selection:bg-none">
            <AnimatePresence>
                {!isReady && (
                    <motion.div 
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="fixed inset-0 flex flex-col items-center justify-center z-50 pointer-events-auto"
                        style={{ backgroundColor: '#6e98a3' }}
                    >
                        <div className="text-white text-3xl font-mono tracking-[0.2em] animate-pulse drop-shadow-sm font-bold">
                            ARCADEGPU_INIT
                        </div>
                        <div className="absolute bottom-4 text-white/50 text-xs font-mono tracking-[0.2em]">
                            DESKTOPMODE // v0.5.1
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="absolute top-4 left-4 pointer-events-auto z-40">
                <h1 className="text-3xl font-mono font-bold text-[#E5E7EB] mb-2 drop-shadow-sm tracking-wider">GPU</h1>
                <HealthBar gameRef={gameScreenRef} />
                <div className="mt-2 bg-slate-800/80 p-[4px] px-[6px] rounded flex items-center border border-slate-700 w-[240px]">
                     <span className="text-white/80 text-[10px] font-mono mr-2 leading-none whitespace-nowrap">SCORE_COUNT</span>
                     <ScoreDisplay gameRef={gameScreenRef} />
                </div>
            </div>
            
            <div className="absolute top-4 right-4 pointer-events-none z-40 flex flex-col items-end">
                <div className="bg-slate-800/80 p-3 rounded-md border border-slate-700 flex flex-col gap-[6px] items-end min-w-[200px]">
                    <div className="text-white text-[11px] font-mono leading-none text-right"><span className="text-white/50 mr-2">[W/S]</span> THROTTLE</div>
                    <div className="text-white text-[11px] font-mono leading-none text-right"><span className="text-white/50 mr-2">[A/D]</span> ROLL</div>
                    <div className="text-white text-[11px] font-mono leading-none text-right"><span className="text-white/50 mr-2">[Q/E]</span> YAW</div>
                    <div className="text-white text-[11px] font-mono leading-none text-right"><span className="text-white/50 mr-2">[SPACE]</span> FIRE</div>
                    <div className="text-white text-[11px] font-mono leading-none text-right"><span className="text-white/50 mr-2">[SHIFT]</span> B-ROLL</div>
                </div>
            </div>

            {/* HUD Crosshair */}
            <div className="fixed inset-0 pointer-events-none flex items-center justify-center mix-blend-screen opacity-70 z-30">
               <div className="absolute w-[40px] h-[2px] bg-emerald-400 rounded shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
               <div className="absolute w-[2px] h-[40px] bg-emerald-400 rounded shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
               <div className="absolute w-[60px] h-[60px] rounded-full border-2 border-emerald-400/50"></div>
               <VirtualJoystickDisplay gameRef={gameScreenRef} />
            </div>

            <div className="absolute bottom-6 left-0 w-full pointer-events-auto flex justify-between items-end px-8 z-40 text-white">
                <Joystick onChange={handleJoystickChange} />
                {isReady && <div className="text-white/40 text-[10px] font-mono tracking-[0.2em] uppercase drop-shadow-sm pointer-events-none pb-2">DESKTOPMODE // v0.5.1</div>}
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
