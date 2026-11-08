export interface SplitItemInput {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface SplitGroupItem {
  name: string;
  quantity: number;
}

export class BillSplitDomainError extends Error {
  constructor(message: string, public readonly code: string = 'BILL_SPLIT_ERROR') {
    super(message);
    this.name = 'BillSplitDomainError';
  }
}

/**
 * MasaLink Adisyon Bölme ve Parçalı Hesap Motoru (Bill Split Service)
 * 
 * 1. Eşit Bölme (Equal Split): Kuruş hassasiyeti garantisi. Parçaların toplamı kuruş kuruş ana tutara eşittir.
 * 2. Kalem Bazlı Bölme (Item-Based Split): Kalem adedi aşımı (Over-allocation) engellenir.
 */
export class BillSplitService {
  /**
   * Eşit Bölme (Equal Split)
   * Kuruş artıklarını ilk paylara dengeli dağıtarak toplamın tam olarak ana hesaba eşit olmasını garanti eder.
   */
  public static calculateEqualSplit(totalAmount: number, splitCount: number): number[] {
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new BillSplitDomainError('Hesap tutarı sıfırdan büyük geçerli bir sayı olmalıdır.', 'INVALID_TOTAL');
    }
    if (!Number.isInteger(splitCount) || splitCount < 2 || splitCount > 100) {
      throw new BillSplitDomainError('Kişi sayısı en az 2, en fazla 100 tam sayı olmalıdır.', 'INVALID_SPLIT_COUNT');
    }

    const totalCents = Math.round(totalAmount * 100);
    const baseCents = Math.floor(totalCents / splitCount);
    const remainderCents = totalCents % splitCount;

    const shares: number[] = [];
    for (let i = 0; i < splitCount; i++) {
      const cents = baseCents + (i < remainderCents ? 1 : 0);
      shares.push(cents / 100);
    }

    return shares;
  }

  /**
   * Kalem Bazlı Bölme Doğrulaması (Item-Based Split Guard)
   * Bir masadaki ürünlerin bölünen toplam adetleri, masada sipariş edilmiş orijinal adetten fazla olamaz.
   */
  public static validateItemSplit(
    originalItems: SplitItemInput[],
    splitGroups: SplitGroupItem[][]
  ): {
    valid: boolean;
    unallocatedItems: Record<string, number>;
  } {
    const orderedMap = new Map<string, number>();
    for (const item of originalItems) {
      const current = orderedMap.get(item.name) || 0;
      orderedMap.set(item.name, current + item.quantity);
    }

    const claimedMap = new Map<string, number>();
    for (const group of splitGroups) {
      for (const item of group) {
        if (item.quantity <= 0) {
          throw new BillSplitDomainError(`Geçersiz ürün adedi: '${item.name}' için miktar sıfırdan büyük olmalıdır.`, 'INVALID_QUANTITY');
        }
        const current = claimedMap.get(item.name) || 0;
        claimedMap.set(item.name, current + item.quantity);
      }
    }

    // Doğrula
    claimedMap.forEach((claimedQty, name) => {
      const orderedQty = orderedMap.get(name) || 0;
      if (claimedQty > orderedQty) {
        throw new BillSplitDomainError(
          `'${name}' ürünü için bölünen toplam adet (${claimedQty}), masada sipariş edilen adedi (${orderedQty}) aşıyor!`,
          'ITEM_SPLIT_QUANTITY_EXCEEDED'
        );
      }
    });

    const unallocatedItems: Record<string, number> = {};
    orderedMap.forEach((orderedQty, name) => {
      const claimedQty = claimedMap.get(name) || 0;
      const unallocated = orderedQty - claimedQty;
      if (unallocated > 0) {
        unallocatedItems[name] = unallocated;
      }
    });

    return {
      valid: true,
      unallocatedItems,
    };
  }
}
