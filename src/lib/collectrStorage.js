import { db } from '../firebase'
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'

// Storage layout (v2):
//   collectr_imports/main             — { collectionNames: [...], schema: 2 }
//   collectr_imports/portfolio_<enc>  — { name: '...', cards: [...] }    one per portfolio
//
// Legacy (v1) had everything in one doc as { collections: { name: [...] } },
// which exceeds Firestore's 1 MB cap once per-card metadata grows. Reads fall
// back to v1 shape until the next successful refresh overwrites it.

const portfolioDocId = (name) => `portfolio_${encodeURIComponent(name)}`

export const writeCollectionsToFirestore = async (collections) => {
  const names = Object.keys(collections)
  await Promise.all(names.map(name =>
    setDoc(doc(db, 'collectr_imports', portfolioDocId(name)), {
      name,
      cards: collections[name] || []
    })
  ))
  await setDoc(doc(db, 'collectr_imports', 'main'), {
    collectionNames: names,
    schema: 2
  })
}

export const readCollectionsFromFirestore = async () => {
  const mainSnap = await getDoc(doc(db, 'collectr_imports', 'main'))
  if (!mainSnap.exists()) return {}
  const data = mainSnap.data()
  if (data.collections) return data.collections // legacy v1
  if (Array.isArray(data.collectionNames)) {
    const docs = await Promise.all(
      data.collectionNames.map(n => getDoc(doc(db, 'collectr_imports', portfolioDocId(n))))
    )
    const out = {}
    data.collectionNames.forEach((n, i) => {
      if (docs[i].exists()) out[n] = docs[i].data().cards || []
    })
    return out
  }
  return {}
}

export const deletePortfolio = async (name, remainingNames) => {
  await deleteDoc(doc(db, 'collectr_imports', portfolioDocId(name)))
  if (remainingNames.length === 0) {
    await deleteDoc(doc(db, 'collectr_imports', 'main'))
  } else {
    await setDoc(doc(db, 'collectr_imports', 'main'), {
      collectionNames: remainingNames,
      schema: 2
    })
  }
}

export const deleteAllPortfolios = async (names) => {
  await Promise.all(names.map(n =>
    deleteDoc(doc(db, 'collectr_imports', portfolioDocId(n)))
  ))
  await deleteDoc(doc(db, 'collectr_imports', 'main'))
}
