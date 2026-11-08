'use client';

import React, { useState } from 'react';
import { HelpCircle, ChevronDown, Sparkles } from 'lucide-react';
import { FAQ_ITEMS } from '@/data/mockData';

export const FaqSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleIndex = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="sss" className="py-20 md:py-28 relative bg-[#09090c]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold mb-4">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Merak Edilenler</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            Sıkça Sorulan Sorular
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-400">
            Masalink'e geçiş süreci, donanım gereksinimleri ve operasyonel detaylar hakkında yanıtlar.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-3.5">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;

            return (
              <div
                key={index}
                className="rounded-2xl border border-white/[0.08] bg-[#111116] overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => toggleIndex(index)}
                  className="w-full py-4 sm:py-5 px-5 sm:px-6 flex items-center justify-between text-left gap-4 focus:outline-none hover:bg-white/[0.02]"
                >
                  <span className="text-sm sm:text-base font-bold text-white">
                    {item.question}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-400 transition-transform duration-300 ${
                      isOpen ? 'rotate-180 bg-orange-500/20 text-orange-400' : ''
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 sm:px-6 pb-5 pt-1 text-xs sm:text-sm text-zinc-300 leading-relaxed border-t border-white/[0.04]">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Still have questions banner */}
        <div className="mt-12 text-center p-6 rounded-2xl bg-gradient-to-r from-orange-500/10 via-zinc-900 to-amber-500/10 border border-orange-500/20">
          <h4 className="text-sm font-bold text-white">Aklınıza takılan başka bir soru mu var?</h4>
          <p className="text-xs text-zinc-400 mt-1">
            Restoran uzmanlarımızla birebir görüşün veya yerinde demo randevusu oluşturun.
          </p>
          <a
            href="mailto:destek@masalink.com"
            className="inline-block mt-3 px-4 py-2 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-colors"
          >
            Uzmanımızla İletişime Geçin &rarr;
          </a>
        </div>

      </div>
    </section>
  );
};
