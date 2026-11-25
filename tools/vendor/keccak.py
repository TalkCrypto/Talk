import sys, json

MASK = (1 << 64) - 1

RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]

R = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
]


def rol(x, n):
    n %= 64
    if n == 0:
        return x
    return ((x << n) | (x >> (64 - n))) & MASK


def keccak_f(A):
    for rnd in range(24):
        C = [A[x][0] ^ A[x][1] ^ A[x][2] ^ A[x][3] ^ A[x][4] for x in range(5)]
        D = [C[(x - 1) % 5] ^ rol(C[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                A[x][y] ^= D[x]
        B = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                B[y][(2 * x + 3 * y) % 5] = rol(A[x][y], R[x][y])
        for x in range(5):
            for y in range(5):
                A[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y]) & B[(x + 2) % 5][y])
                A[x][y] &= MASK
        A[0][0] ^= RC[rnd]
    return A


def keccak256(data: bytes) -> bytes:
    rate = 136
    A = [[0] * 5 for _ in range(5)]
    pad_len = rate - (len(data) % rate)
    padded = bytearray(data)
    padded.append(0x01)
    padded.extend(b"\x00" * (pad_len - 2))
    padded.append(0x80)
    for off in range(0, len(padded), rate):
        block = padded[off:off + rate]
        for i in range(rate // 8):
            lane = int.from_bytes(block[i * 8:(i + 1) * 8], "little")
            x, y = i % 5, i // 5
            A[x][y] ^= lane
        keccak_f(A)
    out = bytearray()
    for i in range(4):
        x, y = i % 5, i // 5
        out.extend(A[x][y].to_bytes(8, "little"))
    return bytes(out[:32])


if __name__ == "__main__":
    # self-test against known vectors
    t1 = keccak256(b"").hex()
    t2 = keccak256(b"transfer(address,uint256)").hex()[:8]
    ok1 = t1 == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    ok2 = t2 == "a9059cbb"
    print("selftest keccak('')=", ok1, " selector(transfer)=", ok2)
    if not (ok1 and ok2):
        print("SELFTEST FAILED", t1, t2)
        sys.exit(1)

    sigs = [
        "TTL()", "FEE_BPS()", "treasury()", "nextId()", "ETH()",
        "inboxes(address)", "prices(address,address)", "accepts(address,address)",
        "quote(address,address,address)", "isContact(address,address)",
        "payments(uint256)",
        "send(address,address,bytes)", "reply(uint256,bytes)", "refund(uint256)",
        "configure(bool,uint8,bytes32,address[],uint256[])",
        "setInbox(bool,uint8,bytes32)", "setPrice(address,uint256,bool)",
    ]
    print("\n-- function selectors --")
    for s in sigs:
        print("0x" + keccak256(s.encode()).hex()[:8], s)

    events = [
        "Message(uint256,address,address,uint256,bytes)",
        "MessagePaid(uint256,address,address,address,uint256,uint64)",
        "Settled(uint256,address,uint256,uint256,uint256)",
        "Refunded(uint256,address,uint256)",
        "InboxSet(address,bool,uint8,bytes32)",
        "PriceSet(address,address,uint256,bool)",
    ]
    print("\n-- event topic0 --")
    for e in events:
        print("0x" + keccak256(e.encode()).hex(), e)
