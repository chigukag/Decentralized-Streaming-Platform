(define-constant ERR-DUPLICATE-CONTENT u100)
(define-constant ERR-CONTENT-NOT-FOUND u101)
(define-constant ERR-NOT-AUTHORIZED u102)
(define-constant ERR-INVALID-HASH u103)
(define-constant ERR-INVALID-TITLE u104)
(define-constant ERR-INVALID-DESCRIPTION u105)
(define-constant ERR-INVALID-IPFS-LINK u106)
(define-constant ERR-INVALID-PRICE u107)
(define-constant ERR-INVALID-ROYALTY u108)
(define-constant ERR-INVALID-CATEGORY u109)
(define-constant ERR-INVALID-TAG u110)
(define-constant ERR-INVALID-METADATA u111)
(define-constant ERR-AUTHORITY-NOT-SET u112)
(define-constant ERR-INVALID-TIMESTAMP u113)
(define-constant ERR-INVALID-PRINCIPAL u114)

(define-data-var next-content-id uint u0)
(define-data-var platform-fee uint u100)
(define-data-var authority-contract (optional principal) none)

(define-map content-store
  { content-id: uint }
  { content-hash: (buff 32), creator: principal, title: (string-ascii 100), description: (string-ascii 500), ipfs-link: (string-ascii 100), price: uint, royalty-rate: uint, category: (string-ascii 50), tags: (list 10 (string-ascii 20)), created-at: uint, updated-at: uint, is-active: bool })

(define-map content-by-hash
  { content-hash: (buff 32) }
  uint)

(define-map content-updates
  { content-id: uint }
  { title: (string-ascii 100), description: (string-ascii 500), ipfs-link: (string-ascii 100), price: uint, updated-at: uint, updater: principal })

(define-read-only (get-content (content-id uint))
  (map-get? content-store { content-id: content-id }))

(define-read-only (get-content-by-hash (content-hash (buff 32)))
  (match (map-get? content-by-hash { content-hash: content-hash })
    id (map-get? content-store { content-id: id })
    none))

(define-read-only (get-content-updates (content-id uint))
  (map-get? content-updates { content-id: content-id }))

(define-read-only (is-content-registered (content-hash (buff 32)))
  (is-some (map-get? content-by-hash { content-hash: content-hash })))

(define-private (validate-hash (content-hash (buff 32)))
  (if (is-eq (len content-hash) u32)
      (ok true)
      (err ERR-INVALID-HASH)))

(define-private (validate-title (title (string-ascii 100)))
  (if (and (> (len title) u0) (<= (len title) u100))
      (ok true)
      (err ERR-INVALID-TITLE)))

(define-private (validate-description (description (string-ascii 500)))
  (if (<= (len description) u500)
      (ok true)
      (err ERR-INVALID-DESCRIPTION)))

(define-private (validate-ipfs-link (ipfs-link (string-ascii 100)))
  (if (and (> (len ipfs-link) u0) (<= (len ipfs-link) u100))
      (ok true)
      (err ERR-INVALID-IPFS-LINK)))

(define-private (validate-price (price uint))
  (if (>= price u0)
      (ok true)
      (err ERR-INVALID-PRICE)))

(define-private (validate-royalty (royalty-rate uint))
  (if (<= royalty-rate u100)
      (ok true)
      (err ERR-INVALID-ROYALTY)))

(define-private (validate-category (category (string-ascii 50)))
  (if (and (> (len category) u0) (<= (len category) u50))
      (ok true)
      (err ERR-INVALID-CATEGORY)))

(define-private (validate-tags (tags (list 10 (string-ascii 20))))
  (if (and (<= (len tags) u10) (fold check-tag tags true))
      (ok true)
      (err ERR-INVALID-TAG)))

(define-private (check-tag (tag (string-ascii 20)) (acc bool))
  (and acc (> (len tag) u0) (<= (len tag) u20)))

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP)))

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-PRINCIPAL)))

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set authority-contract (some contract-principal))
    (ok true)))

(define-public (set-platform-fee (new-fee uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (try! (validate-price new-fee))
    (var-set platform-fee new-fee)
    (ok true)))

(define-public (register-content (content-hash (buff 32)) (title (string-ascii 100)) (description (string-ascii 500)) (ipfs-link (string-ascii 100)) (price uint) (royalty-rate uint) (category (string-ascii 50)) (tags (list 10 (string-ascii 20))))
  (let
    (
      (content-id (var-get next-content-id))
      (authority (var-get authority-contract))
      (validated-hash (try! (validate-hash content-hash)))
      (validated-title (try! (validate-title title)))
      (validated-description (try! (validate-description description)))
      (validated-ipfs-link (try! (validate-ipfs-link ipfs-link)))
      (validated-price (try! (validate-price price)))
      (validated-royalty (try! (validate-royalty royalty-rate)))
      (validated-category (try! (validate-category category)))
      (validated-tags (try! (validate-tags tags)))
    )
    (asserts! (is-some authority) (err ERR-AUTHORITY-NOT-SET))
    (asserts! (is-none (map-get? content-by-hash { content-hash: content-hash })) (err ERR-DUPLICATE-CONTENT))
    (try! (stx-transfer? (var-get platform-fee) tx-sender (unwrap! authority (err ERR-AUTHORITY-NOT-SET))))
    (map-set content-store
      { content-id: content-id }
      { content-hash: content-hash, creator: tx-sender, title: title, description: description, ipfs-link: ipfs-link, price: price, royalty-rate: royalty-rate, category: category, tags: tags, created-at: block-height, updated-at: block-height, is-active: true })
    (map-set content-by-hash { content-hash: content-hash } content-id)
    (var-set next-content-id (+ content-id u1))
    (print { event: "content-registered", id: content-id })
    (ok content-id)))

(define-public (update-content (content-id uint) (title (string-ascii 100)) (description (string-ascii 500)) (ipfs-link (string-ascii 100)) (price uint))
  (let
    (
      (content (map-get? content-store { content-id: content-id }))
      (validated-title (try! (validate-title title)))
      (validated-description (try! (validate-description description)))
      (validated-ipfs-link (try! (validate-ipfs-link ipfs-link)))
      (validated-price (try! (validate-price price)))
    )
    (match content
      c
      (begin
        (asserts! (is-eq (get creator c) tx-sender) (err ERR-NOT-AUTHORIZED))
        (map-set content-store
          { content-id: content-id }
          { content-hash: (get content-hash c), creator: (get creator c), title: title, description: description, ipfs-link: ipfs-link, price: price, royalty-rate: (get royalty-rate c), category: (get category c), tags: (get tags c), created-at: (get created-at c), updated-at: block-height, is-active: (get is-active c) })
        (map-set content-updates
          { content-id: content-id }
          { title: title, description: description, ipfs-link: ipfs-link, price: price, updated-at: block-height, updater: tx-sender })
        (print { event: "content-updated", id: content-id })
        (ok true))
      (err ERR-CONTENT-NOT-FOUND))))

(define-read-only (get-content-count)
  (ok (var-get next-content-id)))
