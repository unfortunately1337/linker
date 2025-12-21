import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LottiePlayer from '../lib/LottiePlayer';

interface GuideStep {
  title: string;
  description: string;
  animationSrc?: string;
}

const guideSteps: GuideStep[] = [
  {
    title: 'Привет, Я Спотти!',
    description: 'Добро пожаловать в твое новое пространство для общения! Друзья созданы для того, чтобы делиться моментами и всегда быть на связи. Чтобы начать диалог, тебе необходимо иметь в друзьях хотя бы одного человека — ведь общение начинается с первого «привет»! Сейчас ты находишься в своем профиле. Здесь ты можешь управлять своим аккаунтом. Настройки пока не самые расширенные, но мы активно растем, и всему свое время — впереди много крутых обновлений! Что еще у нас есть? Анонимные чаты: Хочешь выговориться или найти случайного собеседника, оставаясь инкогнито? У нас это проще простого. Система постов: Делись своими мыслями и фото в ленте. Собирай лайки, следи за количеством просмотров и становись популярным среди своих друзей! Удачи!',
    animationSrc: '/guide.json'
  },
  // Добавьте остальные шаги сюда
];

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const step = guideSteps[currentStep];

  const handleNext = () => {
    if (currentStep < guideSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: '16px',
              padding: '40px',
              maxWidth: '900px',
              width: '90%',
              display: 'flex',
              gap: '40px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
            }}
          >
            {/* Левая часть - текст */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h1
                  style={{
                    fontSize: '32px',
                    fontWeight: 700,
                    color: '#fff',
                    margin: '0 0 20px 0',
                    lineHeight: '1.2',
                  }}
                >
                  {step.title}
                </h1>
                <p
                  style={{
                    fontSize: '16px',
                    color: '#a0a0a0',
                    lineHeight: '1.6',
                    margin: 0,
                  }}
                >
                  {step.description}
                </p>
              </div>

              {/* Кнопки */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '30px' }}>
                <button
                  onClick={handleNext}
                  style={{
                    padding: '12px 24px',
                    borderRadius: '8px',
                    backgroundColor: '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  {currentStep === guideSteps.length - 1 ? 'Хорошо' : 'Дальше'}
                </button>
              </div>
            </div>

            {/* Правая часть - анимация */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '300px',
              }}
            >
            {step.animationSrc && (
                <div style={{ width: '100%', height: '100%' }}>
                  <LottiePlayer
                    src={step.animationSrc}
                    loop={true}
                  />
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GuideModal;
