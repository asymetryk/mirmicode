package main

import (
	"encoding/binary"
	"io"
	"net"
	"testing"
	"time"
)

func TestDialSOCKS5SendsMagicDNSName(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	const host = "cahq.tail21f530.ts.net"
	gotHost := make(chan string, 1)
	gotPort := make(chan int, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		var greeting [3]byte
		if _, err := io.ReadFull(conn, greeting[:]); err != nil {
			t.Errorf("greeting: %v", err)
			return
		}
		if greeting != [3]byte{0x05, 0x01, 0x00} {
			t.Errorf("greeting bytes %v", greeting)
		}
		if _, err := conn.Write([]byte{0x05, 0x00}); err != nil {
			return
		}
		var hdr [5]byte
		if _, err := io.ReadFull(conn, hdr[:]); err != nil {
			t.Errorf("connect hdr: %v", err)
			return
		}
		if hdr[0] != 0x05 || hdr[1] != 0x01 || hdr[3] != 0x03 {
			t.Errorf("connect hdr %v", hdr)
		}
		name := make([]byte, hdr[4])
		if _, err := io.ReadFull(conn, name); err != nil {
			t.Errorf("name: %v", err)
			return
		}
		var portBytes [2]byte
		if _, err := io.ReadFull(conn, portBytes[:]); err != nil {
			t.Errorf("port: %v", err)
			return
		}
		gotHost <- string(name)
		gotPort <- int(binary.BigEndian.Uint16(portBytes[:]))
		_, _ = conn.Write([]byte{0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 1})
		_, _ = io.Copy(io.Discard, conn)
	}()

	conn, err := dialSOCKS5(ln.Addr().String(), host, 443, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	select {
	case seen := <-gotHost:
		if seen != host {
			t.Fatalf("host %q", seen)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for socks host")
	}
	select {
	case port := <-gotPort:
		if port != 443 {
			t.Fatalf("port %d", port)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for socks port")
	}
}

func TestValidDNSName(t *testing.T) {
	if !validDNSName("cahq.tail21f530.ts.net") {
		t.Fatal("expected magicDNS name")
	}
	for _, bad := range []string{"", "has space", "slash/name", "café", string(make([]byte, 254))} {
		if validDNSName(bad) {
			t.Fatalf("accepted %q", bad)
		}
	}
}
